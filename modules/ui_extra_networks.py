import functools
import os.path
import urllib.parse
from pathlib import Path
from typing import Optional, Union
from dataclasses import dataclass

import gzip
import base64
import random
from io import StringIO, BytesIO
import sys

from modules import shared, ui_extra_networks_user_metadata, errors, extra_networks, util
from modules.images import read_info_from_image, save_image_with_geninfo
import gradio as gr
import json
import html
import re
from fastapi.exceptions import HTTPException

from modules.infotext_utils import image_from_url_text

import math

def convert_size(size_bytes):
    if size_bytes == 0:
        return "0B"
    size_name = ("B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"

extra_pages = []
allowed_dirs = set()
default_allowed_preview_extensions = ["png", "jpg", "jpeg", "webp", "gif"]

@functools.cache
def allowed_preview_extensions_with_extra(extra_extensions=None):
    return set(default_allowed_preview_extensions) | set(extra_extensions or [])


def allowed_preview_extensions():
    return allowed_preview_extensions_with_extra((shared.opts.samples_format, ))


@dataclass
class ExtraNetworksItem:
    """Wrapper for dictionaries representing ExtraNetworks items."""
    item: dict

class ExtraNetworksItemJsonEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ExtraNetworksItem):
            return obj.item
        return json.JSONEncoder.default(self, obj)


def get_tree(paths: Union[str, list[str]], items: dict[str, ExtraNetworksItem]) -> dict:
    """Recursively builds a directory tree.

    Args:
        paths: Path or list of paths to directories. These paths are treated as roots from which
            the tree will be built.
        items: A dictionary associating filepaths to an ExtraNetworksItem instance.

    Returns:
        The result directory tree.
    """
    if isinstance(paths, (str,)):
        paths = [paths]

    def _get_tree(_paths: list[str], _root: str):
        _res = {}
        for path in _paths:
            relpath = os.path.relpath(path, _root)
            if os.path.isdir(path):
                dir_items = os.listdir(path)
                # Ignore empty directories.
                if not dir_items:
                    continue
                dir_tree = _get_tree([os.path.join(path, x) for x in dir_items], _root)
                # We only want to store non-empty folders in the tree.
                if dir_tree:
                    _res[relpath] = dir_tree
            else:
                if path not in items:
                    continue
                # Add the ExtraNetworksItem to the result.
                _res[relpath] = items[path]
        return _res

    res = {}
    # Handle each root directory separately.
    # Each root WILL have a key/value at the root of the result dict though
    # the value can be an empty dict if the directory is empty. We want these
    # placeholders for empty dirs so we can inform the user later.
    for path in paths:
        root = os.path.dirname(path)
        relpath = os.path.relpath(path, root)
        # Wrap the path in a list since that is what the `_get_tree` expects.
        res[relpath] = _get_tree([path], root)
        if res[relpath]:
            # We need to pull the inner path out one for these root dirs.
            res[relpath] = res[relpath][relpath]

    return res

def register_page(page):
    """registers extra networks page for the UI; recommend doing it in on_before_ui() callback for extensions"""

    extra_pages.append(page)
    allowed_dirs.clear()
    allowed_dirs.update(set(sum([x.allowed_directories_for_previews() for x in extra_pages], [])))


def fetch_file(filename: str = ""):
    from starlette.responses import FileResponse

    if not os.path.isfile(filename):
        raise HTTPException(status_code=404, detail="File not found")

    if not any(Path(x).absolute() in Path(filename).absolute().parents for x in allowed_dirs):
        raise ValueError(f"File cannot be fetched: {filename}. Must be in one of directories registered by extra pages.")

    ext = os.path.splitext(filename)[1].lower()[1:]
    if ext not in allowed_preview_extensions():
        raise ValueError(f"File cannot be fetched: {filename}. Extensions allowed: {allowed_preview_extensions()}.")

    # would profit from returning 304
    return FileResponse(filename, headers={"Accept-Ranges": "bytes"})


def get_metadata(page: str = "", item: str = ""):
    from starlette.responses import JSONResponse

    page = next(iter([x for x in extra_pages if x.name == page]), None)
    if page is None:
        return JSONResponse({})

    metadata = page.metadata.get(item)
    if metadata is None:
        return JSONResponse({})

    return JSONResponse({"metadata": json.dumps(metadata, indent=4, ensure_ascii=False)})


def get_single_card(page: str = "", tabname: str = "", name: str = ""):
    from starlette.responses import JSONResponse

    page = next(iter([x for x in extra_pages if x.name == page]), None)

    try:
        item = page.create_item(name, enable_filter=False)
        page.items[name] = item
    except Exception as e:
        errors.display(e, "creating item for extra network")
        item = page.items.get(name)

    page.read_user_metadata(item, use_cache=False)
    item_html = page.create_item_html(tabname, item, shared.html("extra-networks-card.html"))

    return JSONResponse({"html": item_html})


def add_pages_to_demo(app):
    app.add_api_route("/sd_extra_networks/thumb", fetch_file, methods=["GET"])
    app.add_api_route("/sd_extra_networks/metadata", get_metadata, methods=["GET"])
    app.add_api_route("/sd_extra_networks/get-single-card", get_single_card, methods=["GET"])


def quote_js(s):
    s = s.replace('\\', '\\\\')
    s = s.replace('"', '\\"')
    return f'"{s}"'

def build_row(
    div_id: int,
    tabname: str,
    extra_networks_tabname: str,
    label: str,
    btn_type: str,
    btn_copy_path_tpl: str,
    btn_edit_item_tpl: str,
    btn_metadata_tpl: str,
    tree_row_tpl: str,
    parent_id: Optional[int] = None,
    data_depth: Optional[int] = None,
    data_path: Optional[str] = None,
    data_hash: Optional[str] = None,
    data_prompt: Optional[str] = None,
    data_neg_prompt: Optional[str] = None,
    data_allow_neg: Optional[str] = None,
    onclick_extra: Optional[str] = None,
) -> str:
    if btn_type not in ["file", "dir"]:
        raise ValueError("Invalid button type:", btn_type)

    subitem = "has-subitem"
    action_list_item_action_leading = "<i class='tree-list-item-action-chevron'></i>"
    action_list_item_visual_leading = "🗀"
    action_list_item_action_trailing = ""
    action_list_item_visual_trailing = ""

    if btn_type == "file":
        subitem = "subitem"
        action_list_item_visual_leading = "🗎"
        # Action buttons
        action_list_item_visual_trailing += "<div class=\"button-row\">"
        action_list_item_visual_trailing += btn_copy_path_tpl.format(**{
            "filename": data_path
        })
        action_list_item_visual_trailing += btn_edit_item_tpl.format(**{
            "tabname": tabname,
            "extra_networks_tabname": extra_networks_tabname,
            "name": label,
        })
        action_list_item_visual_trailing += btn_metadata_tpl.format(**{
            "extra_networks_tabname": extra_networks_tabname,
            "name": label,
        })
        action_list_item_visual_trailing += "</div>"

    data_attributes = ""
    data_attributes += f"data-path={data_path} " if data_path is not None else ""
    data_attributes += f"data-hash={data_hash} " if data_hash is not None else ""
    data_attributes += f"data-prompt={data_prompt} " if data_prompt else ""
    data_attributes += f"data-neg-prompt={data_neg_prompt} " if data_neg_prompt else ""
    data_attributes += f"data-allow-neg={data_allow_neg} " if data_allow_neg else ""
    data_attributes += f"data-tree-entry-type={btn_type} " if btn_type is not None else ""
    data_attributes += f"data-div-id={div_id} " if div_id is not None else ""
    data_attributes += f"data-parent-id={parent_id} " if parent_id is not None else ""
    data_attributes += f"data-depth={data_depth} " if data_depth is not None else ""
    data_attributes += "data-expanded " if parent_id is None else "" # inverted to expand root

    res = tree_row_tpl.format(
        **{
            "data_attributes": data_attributes,
            "subitem": subitem,
            "search_terms": "",
            "btn_type": btn_type,
            "tabname": tabname,
            "onclick_extra": onclick_extra if onclick_extra else "",
            "extra_networks_tabname": extra_networks_tabname,
            "action_list_item_action_leading": action_list_item_action_leading,
            "action_list_item_visual_leading": action_list_item_visual_leading,
            "action_list_item_label": label,
            "action_list_item_visual_trailing": action_list_item_visual_trailing,
            "action_list_item_action_trailing": action_list_item_action_trailing,
        }
    )

    res = res.strip()
    res = re.sub(" +", " ", res.replace("\n", ""))
    return res

def build_tree(
    tree: dict,
    res: dict,
    tabname: str,
    extra_networks_tabname: str,
    div_id: int,
    depth: int,
    btn_copy_path_tpl: str,
    btn_edit_item_tpl: str,
    btn_metadata_tpl: str,
    tree_row_tpl: str,
    allow_negative_prompt: Optional[bool] = None,
    parent_id: Optional[int] = None,
) -> int:
    for k, v in sorted(tree.items(), key=lambda x: shared.natural_sort_key(x[0])):
        if not isinstance(v, (ExtraNetworksItem,)):
            # dir
            if div_id in res:
                raise KeyError("div_id already in res:", div_id)

            res[div_id] = build_row(
                div_id=div_id,
                parent_id=parent_id,
                tabname=tabname,
                extra_networks_tabname=extra_networks_tabname,
                label=k,
                data_depth=depth,
                data_path=k,
                btn_type="dir",
                btn_copy_path_tpl=btn_copy_path_tpl,
                btn_edit_item_tpl=btn_edit_item_tpl,
                btn_metadata_tpl=btn_metadata_tpl,
                tree_row_tpl=tree_row_tpl,
            )
            last_div_id = build_tree(
                tree=v,
                res=res,
                depth=depth + 1,
                div_id=div_id + 1,
                parent_id=div_id,
                tabname=tabname,
                extra_networks_tabname=extra_networks_tabname,
                allow_negative_prompt=allow_negative_prompt,
                btn_copy_path_tpl=btn_copy_path_tpl,
                btn_edit_item_tpl=btn_edit_item_tpl,
                btn_metadata_tpl=btn_metadata_tpl,
                tree_row_tpl=tree_row_tpl,
            )
            div_id = last_div_id
        else:
            # file
            if div_id in res:
                raise KeyError("div_id already in res:", div_id)

            onclick = v.item.get("onclick", None)
            if onclick is None:
                # Don't quote prompt/neg_prompt since they are stored as js strings already.
                onclick_js_tpl = "cardClicked('{tabname}', {prompt}, {neg_prompt}, {allow_neg});"
                onclick = onclick_js_tpl.format(
                    **{
                        "tabname": tabname,
                        "prompt": v.item["prompt"],
                        "neg_prompt": v.item.get("negative_prompt", "''"),
                        "allow_neg": str(allow_negative_prompt).lower(),
                    }
                )
                onclick = html.escape(onclick)

            res[div_id] = build_row(
                div_id=div_id,
                parent_id=parent_id,
                tabname=tabname,
                extra_networks_tabname=extra_networks_tabname,
                label=v.item["name"],
                data_depth=depth,
                data_path=v.item["filename"],
                data_hash=v.item["shorthash"],
                data_prompt=html.escape(v.item.get("prompt", "''")),
                data_neg_prompt=html.escape(v.item.get("negative_prompt", "''")),
                data_allow_neg=str(allow_negative_prompt).lower(),
                onclick_extra=onclick,
                btn_type="file",
                btn_copy_path_tpl=btn_copy_path_tpl,
                btn_edit_item_tpl=btn_edit_item_tpl,
                btn_metadata_tpl=btn_metadata_tpl,
                tree_row_tpl=tree_row_tpl,
            )
        div_id += 1
    return div_id

def compressStringToBytes(inputString):
    """
    read the given string, encode it in utf-8,
    compress the data and return it as a byte array.
    """
    bio = BytesIO()
    bio.write(inputString.encode("utf-8"))
    bio.seek(0)
    stream = BytesIO()
    compressor = gzip.GzipFile(fileobj=stream, mode='w')
    while True:  # until EOF
        chunk = bio.read(8192)
        if not chunk:  # EOF?
            compressor.close()
            return stream.getvalue()
        compressor.write(chunk)

class ExtraNetworksPage:
    def __init__(self, title):
        self.title = title
        self.name = title.lower()
        # This is the actual name of the extra networks tab (not txt2img/img2img).
        self.extra_networks_tabname = self.name.replace(" ", "_")
        self.allow_prompt = True
        self.allow_negative_prompt = False
        self.metadata = {}
        self.items = {}
        self.lister = util.MassFileLister()
        # HTML Templates
        self.pane_tpl = shared.html("extra-networks-pane.html")
        self.card_tpl = shared.html("extra-networks-card.html")
        self.btn_copy_path_tpl = shared.html("extra-networks-copy-path-button.html")
        self.btn_metadata_tpl = shared.html("extra-networks-metadata-button.html")
        self.btn_edit_item_tpl = shared.html("extra-networks-edit-item-button.html")
        self.tree_row_tpl = shared.html("extra-networks-tree-row.html")

    def refresh(self):
        pass

    def read_user_metadata(self, item, use_cache=True):
        filename = item.get("filename", None)
        metadata = extra_networks.get_user_metadata(filename, lister=self.lister if use_cache else None)

        desc = metadata.get("description", None)
        if desc is not None:
            item["description"] = desc

        item["user_metadata"] = metadata

    def link_preview(self, filename):
        quoted_filename = urllib.parse.quote(filename.replace('\\', '/'))
        mtime, _ = self.lister.mctime(filename)
        return f"./sd_extra_networks/thumb?filename={quoted_filename}&mtime={mtime}"

    def search_terms_from_path(self, filename, possible_directories=None):
        abspath = os.path.abspath(filename)
        for parentdir in (possible_directories if possible_directories is not None else self.allowed_directories_for_previews()):
            parentdir = os.path.dirname(os.path.abspath(parentdir))
            if abspath.startswith(parentdir):
                return os.path.relpath(abspath, parentdir)

        return ""

    def create_item_html(
        self,
        tabname: str,
        item: dict,
        template: Optional[str] = None,
        div_id: Optional[int] = None,
    ) -> Union[str, dict]:
        """Generates HTML for a single ExtraNetworks Item.

        Args:
            tabname: The name of the active tab.
            item: Dictionary containing item information.
            template: Optional template string to use.

        Returns:
            If a template is passed: HTML string generated for this item.
                Can be empty if the item is not meant to be shown.
            If no template is passed: A dictionary containing the generated item's attributes.
        """
        preview = item.get("preview", None)
        style_height = f"height: {shared.opts.extra_networks_card_height}px;" if shared.opts.extra_networks_card_height else ''
        style_width = f"width: {shared.opts.extra_networks_card_width}px;" if shared.opts.extra_networks_card_width else ''
        style_font_size = f"font-size: {shared.opts.extra_networks_card_text_scale*100}%;"
        card_style = style_height + style_width + style_font_size
        background_image = f'<img src="{html.escape(preview)}" class="preview" loading="lazy">' if preview else ''

        onclick = item.get("onclick", None)
        if onclick is None:
            # Don't quote prompt/neg_prompt since they are stored as js strings already.
            onclick_js_tpl = "cardClicked('{tabname}', {prompt}, {neg_prompt}, {allow_neg});"
            onclick = onclick_js_tpl.format(
                **{
                    "tabname": tabname,
                    "prompt": item["prompt"],
                    "neg_prompt": item.get("negative_prompt", "''"),
                    "allow_neg": str(self.allow_negative_prompt).lower(),
                }
            )
            onclick = html.escape(onclick)

        btn_copy_path = self.btn_copy_path_tpl.format(**{"filename": item["filename"]})
        btn_metadata = ""
        metadata = item.get("metadata")
        if metadata:
            btn_metadata = self.btn_metadata_tpl.format(
                **{
                    "extra_networks_tabname": self.extra_networks_tabname,
                    "name": html.escape(item["name"]),
                }
            )
        btn_edit_item = self.btn_edit_item_tpl.format(
            **{
                "tabname": tabname,
                "extra_networks_tabname": self.extra_networks_tabname,
                "name": html.escape(item["name"]),
            }
        )

        local_path = ""
        filename = item.get("filename", "")
        for reldir in self.allowed_directories_for_previews():
            absdir = os.path.abspath(reldir)

            if filename.startswith(absdir):
                local_path = filename[len(absdir):]

        # if this is true, the item must not be shown in the default view, and must instead only be
        # shown when searching for it
        if shared.opts.extra_networks_hidden_models == "Always":
            search_only = False
        else:
            search_only = "/." in local_path or "\\." in local_path

        if search_only and shared.opts.extra_networks_hidden_models == "Never":
            return ""

        sort_keys = " ".join(
            [
                f'data-sort-{k}="{html.escape(str(v))}"'
                for k, v in item.get("sort_keys", {}).items()
            ]
        ).strip()

        search_terms_html = ""
        search_term_template = "<span class='hidden {class}'>{search_term}</span>"
        for search_term in item.get("search_terms", []):
            search_terms_html += search_term_template.format(
                **{
                    "class": f"search_terms{' search_only' if search_only else ''}",
                    "search_term": search_term,
                }
            )

        description = (item.get("description", "") or "" if shared.opts.extra_networks_card_show_desc else "")
        if not shared.opts.extra_networks_card_description_is_html:
            description = html.escape(description)

        # Some items here might not be used depending on HTML template used.
        args = {
            "div_id": "" if div_id is None else div_id,
            "background_image": background_image,
            "card_clicked": onclick,
            "copy_path_button": btn_copy_path,
            "description": description,
            "edit_button": btn_edit_item,
            "local_preview": quote_js(item["local_preview"]),
            "metadata_button": btn_metadata,
            "name": html.escape(item["name"]),
            "data_prompt": item.get("prompt", "''"),
            "data_neg_prompt": item.get("negative_prompt", "''"),
            "data_allow_neg": str(self.allow_negative_prompt).lower(),
            "save_card_preview": html.escape(f"return saveCardPreview(event, '{tabname}', '{item['local_preview']}');"),
            "search_only": " search_only" if search_only else "",
            "search_terms": search_terms_html,
            "sort_keys": sort_keys,
            "style": card_style,
            "tabname": tabname,
            "extra_networks_tabname": self.extra_networks_tabname,
        }

        if template:
            return template.format(**args)
        else:
            return args

    def create_tree_view_html(self, tabname: str) -> str:
        """Generates HTML for displaying folders in a tree view.

        Args:
            tabname: The name of the active tab.

        Returns:
            HTML string generated for this tree view.
        """
        res = {}

        # Setup the tree dictionary.
        roots = self.allowed_directories_for_previews()
        tree_items = {v["filename"]: ExtraNetworksItem(v) for v in self.items.values()}
        tree = get_tree([os.path.abspath(x) for x in roots], items=tree_items)

        if not tree:
            return res

        build_tree(
            tree=tree,
            res=res,
            depth=0,
            div_id=0,
            parent_id=None,
            tabname=tabname,
            extra_networks_tabname=self.extra_networks_tabname,
            allow_negative_prompt=self.allow_negative_prompt,
            btn_copy_path_tpl=self.btn_copy_path_tpl,
            btn_edit_item_tpl=self.btn_edit_item_tpl,
            btn_metadata_tpl=self.btn_metadata_tpl,
            tree_row_tpl=self.tree_row_tpl,
        )
        res = base64.b64encode(gzip.compress(json.dumps(res).encode("utf-8"))).decode("utf-8")
        return f'<div class="extra-networks-script-data" data-tabname-full={tabname}_{self.extra_networks_tabname} data-proxy-name=tree_list data-json={res} hidden></div>'

    def create_card_view_html(self, tabname: str, *, none_message) -> str:
        """Generates HTML for the network Card View section for a tab.

        This HTML goes into the `extra-networks-pane.html` <div> with
        `id='{tabname}_{extra_networks_tabname}_cards`.

        Args:
            tabname: The name of the active tab.
            none_message: HTML text to show when there are no cards.

        Returns:
            HTML formatted string.
        """
        res = {}
        for i, item in enumerate(self.items.values()):
            res[i] = self.create_item_html(tabname, item, self.card_tpl, div_id=i)

        res = base64.b64encode(gzip.compress(json.dumps(res).encode("utf-8"))).decode("utf-8")
        return f'<div class="extra-networks-script-data" data-tabname-full={tabname}_{self.extra_networks_tabname} data-proxy-name=cards_list data-json={res} hidden></div>'

    def create_html(self, tabname, *, empty=False):
        """Generates an HTML string for the current pane.

        The generated HTML uses `extra-networks-pane.html` as a template.

        Args:
            tabname: The name of the active tab.
            empty: create an empty HTML page with no items

        Returns:
            HTML formatted string.
        """
        self.lister.reset()
        self.metadata = {}

        items_list = [] if empty else self.list_items()
        self.items = {x["name"]: x for x in items_list}

        # Populate the instance metadata for each item.
        for item in self.items.values():
            metadata = item.get("metadata")
            if metadata:
                self.metadata[item["name"]] = metadata

            if "user_metadata" not in item:
                self.read_user_metadata(item)

        data_sort_dir = shared.opts.extra_networks_card_order.lower().strip()
        data_sort_mode = shared.opts.extra_networks_card_order_field.lower().strip()
        tree_view_btn_extra_class = ""
        tree_view_div_extra_class = "hidden"
        tree_view_div_default_display = "none"
        extra_network_pane_content_default_display = "flex"
        if shared.opts.extra_networks_tree_view_default_enabled:
            tree_view_btn_extra_class = "extra-network-control--enabled"
            tree_view_div_extra_class = ""
            tree_view_div_default_display = "block"
            extra_network_pane_content_default_display = "grid"

        return self.pane_tpl.format(
            **{
                "tabname": tabname,
                "extra_networks_tabname": self.extra_networks_tabname,
                "data_sort_mode": data_sort_mode,
                "data_sort_dir": data_sort_dir,
                "tree_view_btn_extra_class": tree_view_btn_extra_class,
                "tree_view_div_extra_class": tree_view_div_extra_class,
                "tree_html": self.create_tree_view_html(tabname),
                "cards_html": self.create_card_view_html(tabname, none_message="Loading..." if empty else None),
                "extra_networks_tree_view_default_width": shared.opts.extra_networks_tree_view_default_width,
                "tree_view_div_default_display": tree_view_div_default_display,
                "extra_network_pane_content_default_display": extra_network_pane_content_default_display,
            }
        )

    def create_item(self, name, index=None):
        raise NotImplementedError()

    def list_items(self):
        raise NotImplementedError()

    def allowed_directories_for_previews(self):
        return []

    def get_sort_keys(self, path):
        """
        List of default keys used for sorting in the UI.
        """
        pth = Path(path)
        mtime, ctime = self.lister.mctime(path)
        return {
            "date_created": int(mtime),
            "date_modified": int(ctime),
            "name": pth.name.lower(),
            "path": str(pth).lower(),
        }

    def find_preview(self, path):
        """
        Find a preview PNG for a given path (without extension) and call link_preview on it.
        """

        potential_files = sum([[f"{path}.{ext}", f"{path}.preview.{ext}"] for ext in allowed_preview_extensions()], [])

        for file in potential_files:
            if self.lister.exists(file):
                return self.link_preview(file)

        return None

    def find_description(self, path):
        """
        Find and read a description file for a given path (without extension).
        """
        for file in [f"{path}.txt", f"{path}.description.txt"]:
            if not self.lister.exists(file):
                continue

            try:
                with open(file, "r", encoding="utf-8", errors="replace") as f:
                    return f.read()
            except OSError:
                pass
        return None

    def create_user_metadata_editor(self, ui, tabname):
        return ui_extra_networks_user_metadata.UserMetadataEditor(ui, tabname, self)


def initialize():
    extra_pages.clear()


def register_default_pages():
    from modules.ui_extra_networks_textual_inversion import ExtraNetworksPageTextualInversion
    from modules.ui_extra_networks_hypernets import ExtraNetworksPageHypernetworks
    from modules.ui_extra_networks_checkpoints import ExtraNetworksPageCheckpoints
    register_page(ExtraNetworksPageTextualInversion())
    register_page(ExtraNetworksPageHypernetworks())
    register_page(ExtraNetworksPageCheckpoints())


class ExtraNetworksUi:
    def __init__(self):
        self.pages = None
        """gradio HTML components related to extra networks' pages"""

        self.page_contents = None
        """HTML content of the above; empty initially, filled when extra pages have to be shown"""

        self.stored_extra_pages = None

        self.button_save_preview = None
        self.preview_target_filename = None

        self.tabname = None


def pages_in_preferred_order(pages):
    tab_order = [x.lower().strip() for x in shared.opts.ui_extra_networks_tab_reorder.split(",")]

    def tab_name_score(name):
        name = name.lower()
        for i, possible_match in enumerate(tab_order):
            if possible_match in name:
                return i

        return len(pages)

    tab_scores = {page.name: (tab_name_score(page.name), original_index) for original_index, page in enumerate(pages)}

    return sorted(pages, key=lambda x: tab_scores[x.name])


def create_ui(interface: gr.Blocks, unrelated_tabs, tabname):
    ui = ExtraNetworksUi()
    ui.pages = []
    ui.pages_contents = []
    ui.user_metadata_editors = []
    ui.stored_extra_pages = pages_in_preferred_order(extra_pages.copy())
    ui.tabname = tabname

    related_tabs = []

    for page in ui.stored_extra_pages:
        with gr.Tab(page.title, elem_id=f"{tabname}_{page.extra_networks_tabname}", elem_classes=["extra-page"]) as tab:
            with gr.Column(elem_id=f"{tabname}_{page.extra_networks_tabname}_prompts", elem_classes=["extra-page-prompts"]):
                pass

            elem_id = f"{tabname}_{page.extra_networks_tabname}_html"
            page_elem = gr.HTML(page.create_html(tabname, empty=True), elem_id=elem_id)
            ui.pages.append(page_elem)
            editor = page.create_user_metadata_editor(ui, tabname)
            editor.create_ui()
            ui.user_metadata_editors.append(editor)
            related_tabs.append(tab)

    ui.button_save_preview = gr.Button('Save preview', elem_id=f"{tabname}_save_preview", visible=False)
    ui.preview_target_filename = gr.Textbox('Preview save filename', elem_id=f"{tabname}_preview_filename", visible=False)

    for tab in unrelated_tabs:
        tab.select(fn=None, _js=f"function(){{extraNetworksUnrelatedTabSelected('{tabname}');}}", inputs=[], outputs=[], show_progress=False)

    for page, tab in zip(ui.stored_extra_pages, related_tabs):
        jscode = (
            "function(){"
            f"extraNetworksTabSelected('{tabname}', '{tabname}_{page.extra_networks_tabname}_prompts', {str(page.allow_prompt).lower()}, {str(page.allow_negative_prompt).lower()}, '{tabname}_{page.extra_networks_tabname}');"
            f"applyExtraNetworkFilter('{tabname}_{page.extra_networks_tabname}');"
            "}"
        )
        tab.select(fn=None, _js=jscode, inputs=[], outputs=[], show_progress=False)

        def refresh():
            for pg in ui.stored_extra_pages:
                pg.refresh()
            create_html()
            return ui.pages_contents

        button_refresh = gr.Button("Refresh", elem_id=f"{tabname}_{page.extra_networks_tabname}_extra_refresh_internal", visible=False)
        button_refresh.click(
            fn=refresh,
            inputs=[],
            outputs=ui.pages,
        ).then(
            fn=lambda: None,
            _js="setupAllResizeHandles",
        ).then(
            fn=lambda: None,
            _js=f"function(){{ extraNetworksRefreshTab('{tabname}_{page.extra_networks_tabname}'); }}",
        )

    def create_html():
        ui.pages_contents = [pg.create_html(ui.tabname) for pg in ui.stored_extra_pages]

    def pages_html():
        if not ui.pages_contents:
            create_html()
        return ui.pages_contents

    interface.load(fn=pages_html, inputs=[], outputs=ui.pages).then(fn=lambda: None, _js='setupAllResizeHandles').then(fn=lambda: None, _js="setupExtraNetworksData")

    return ui


def path_is_parent(parent_path, child_path):
    parent_path = os.path.abspath(parent_path)
    child_path = os.path.abspath(child_path)

    return child_path.startswith(parent_path)


def setup_ui(ui, gallery):
    def save_preview(index, images, filename):
        # this function is here for backwards compatibility and likely will be removed soon

        if len(images) == 0:
            print("There is no image in gallery to save as a preview.")
            return [page.create_html(ui.tabname) for page in ui.stored_extra_pages]

        index = int(index)
        index = 0 if index < 0 else index
        index = len(images) - 1 if index >= len(images) else index

        img_info = images[index if index >= 0 else 0]
        image = image_from_url_text(img_info)
        geninfo, items = read_info_from_image(image)

        is_allowed = False
        for extra_page in ui.stored_extra_pages:
            if any(path_is_parent(x, filename) for x in extra_page.allowed_directories_for_previews()):
                is_allowed = True
                break

        assert is_allowed, f'writing to {filename} is not allowed'

        save_image_with_geninfo(image, geninfo, filename)

        return [page.create_html(ui.tabname) for page in ui.stored_extra_pages]

    ui.button_save_preview.click(
        fn=save_preview,
        _js="function(x, y, z){return [selected_gallery_index(), y, z]}",
        inputs=[ui.preview_target_filename, gallery, ui.preview_target_filename],
        outputs=[*ui.pages]
    )

    for editor in ui.user_metadata_editors:
        editor.setup_ui(gallery)
