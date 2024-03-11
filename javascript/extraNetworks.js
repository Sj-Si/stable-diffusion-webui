function parseHTML(str) {
    const tmp = document.implementation.createHTMLDocument('');
    tmp.body.innerHTML = str;
    return [...tmp.body.childNodes];
}

function getBoxShadow(depth) {
    let res = "";
    var style = getComputedStyle(document.body);
    let bg = style.getPropertyValue("--body-background-fill");
    let fg = style.getPropertyValue("--neutral-800");
    for (let i = 1; i <= depth; i++) {
        res += `${i - 0.6}rem 0 0 ${bg} inset,`;
        res += `${i - 0.4}rem 0 0 ${fg} inset`;
        res += (i+1 > depth) ? "" : ", ";
    }
    return res;
}

const getComputedValue = function(container, css_property) {
    return parseInt(
        window.getComputedStyle(container, null)
            .getPropertyValue(css_property)
            .split("px")[0]
    );
};

function calc_columns_per_row(parent) {
    // Returns the number of columns in a row of a flexbox.
    //const parent = document.querySelector(selector);
    const parent_width = getComputedValue(parent, "width");
    const parent_padding_left = getComputedValue(parent,"padding-left");
    const parent_padding_right = getComputedValue(parent,"padding-right");

    const child = parent.firstElementChild;
    const child_width = getComputedValue(child,"width");
    const child_margin_left = getComputedValue(child,"margin-left");
    const child_margin_right = getComputedValue(child,"margin-right");

    var parent_width_no_padding = parent_width - parent_padding_left - parent_padding_right;
    const child_width_with_margin = child_width + child_margin_left + child_margin_right;
    parent_width_no_padding += child_margin_left + child_margin_right;

    return parseInt(parent_width_no_padding / child_width_with_margin);
}

function calc_rows_per_column(container, parent) {
    // Returns the number of columns in a row of a flexbox.
    //const parent = document.querySelector(selector);
    const parent_height = getComputedValue(container, "height");
    const parent_padding_top = getComputedValue(container,"padding-top");
    const parent_padding_bottom = getComputedValue(container,"padding-bottom");

    const child = parent.firstElementChild;
    const child_height = getComputedValue(child,"height");
    const child_margin_top = getComputedValue(child,"margin-top");
    const child_margin_bottom = getComputedValue(child,"margin-bottom");

    var parent_height_no_padding = parent_height - parent_padding_top - parent_padding_bottom;
    const child_height_with_margin = child_height + child_margin_top + child_margin_bottom;
    parent_height_no_padding += child_margin_top + child_margin_bottom;

    return parseInt(parent_height_no_padding / child_height_with_margin);
}

const INT_COLLATOR = new Intl.Collator([], {numeric: true});
const STR_COLLATOR = new Intl.Collator("en", {numeric: true, sensitivity: "base"});

const compress = string => {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();

    const blobToBase64 = blob => new Promise((resolve, _) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
    const byteArray = new TextEncoder().encode(string);
    writer.write(byteArray);
    writer.close();
    return new Response(cs.readable).blob().then(blobToBase64);
};

const decompress = base64string => {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const bytes = Uint8Array.from(atob(base64string), c => c.charCodeAt(0));
    writer.write(bytes);
    writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (arrayBuffer) {
        return new TextDecoder().decode(arrayBuffer);
    });
}

class ExtraNetworksClusterize {
    constructor(
        {
            scroll_id,
            content_id,
            rows_in_block = 10,
            blocks_in_cluster = 4,
            show_no_data_row = true,
            callbacks = {},
        } = {
            rows_in_block: 10,
            blocks_in_cluster: 4,
            show_no_data_row: true,
            callbacks: {},
        }
    ) {
        if (scroll_id === undefined) {
            console.error("scroll_id is undefined!");
        }
        if (content_id === undefined) {
            console.error("content_id is undefined!");
        }

        this.scroll_id = scroll_id;
        this.content_id = content_id;
        this.rows_in_block = rows_in_block;
        this.default_rows_in_block = rows_in_block;
        this.default_blocks_in_cluster = blocks_in_cluster;
        this.blocks_in_cluster = blocks_in_cluster;
        this.show_no_data_row = show_no_data_row;
        this.callbacks = callbacks;

        this.active = false;

        this.no_data_text = "Directory is empty.";
        this.no_data_class = "nocards";

        this.scroll_elem = document.getElementById(this.scroll_id);
        this.content_elem = document.getElementById(this.content_id);

        this.n_rows = 1;
        this.n_cols = 1;
        
        this.sort_fn = this.sort_by_div_id;
        this.sort_reverse = false;

        this.data_obj = {};
        this.data_obj_keys_sorted = [];

        this.clusterize = new Clusterize(
            {
                rows: [],
                scrollId: this.scroll_id,
                contentId: this.content_id,
                rows_in_block: this.rows_in_block,
                blocks_in_cluster: this.blocks_in_cluster,
                show_no_data_row: this.show_no_data_row,
                callbacks: this.callbacks,
            }
        );
    }

    sort_by_div_id() {
        // Sort data_obj keys (div_id) as numbers.
        this.data_obj_keys_sorted = Object.keys(this.data_obj).sort((a, b) => INT_COLLATOR.compare(a, b));
    }

    apply_sort() {
        this.sort_fn()
        if (this.sort_reverse) {
            this.data_obj_keys_sorted = this.data_obj_keys_sorted.reverse();
        }
        this.update_rows();
    }

    filter_rows(obj) {
        var results = [];
        for (const div_id of this.data_obj_keys_sorted) {
            if (obj[div_id].active) {
                results.push(obj[div_id].element.outerHTML);
            }
        }
        return results;
    }

    update_div(div_id, content) {
        /** Updates an element in the dataset. Does not call update_rows(). */
        if (!(div_id in this.data_obj)) {
            console.error("div_id not in data_obj:", div_id);
        } else if (typeof content === "object") {
            this.data_obj[div_id].element = parseHTML(content.outerHTML)[0];
            return true;
        } else if (typeof content === "string") {
            this.data_obj[div_id].element = parseHTML(content)[0];
            return true;
        } else {
            console.error("Invalid content:", div_id, content);
        }

        return false;
    }

    update_rows() {
        this.clusterize.update(this.filter_rows(this.data_obj));
    }

    nrows() {
        return this.clusterize.getRowsAmount();
    }

    update_item_dims() {
        if (!this.active) {
            return;
        }
        // Calculate the visible rows and colums for the clusterize-content area.
        var content_elem = document.getElementById(this.content_elem.id);
        let n_cols = calc_columns_per_row(content_elem);
        let n_rows = calc_rows_per_column(content_elem.parentElement, content_elem);
        
        n_cols = isNaN(n_cols) || n_cols <= 0 ? 1 : n_cols;
        n_rows = isNaN(n_rows) || n_rows <= 0 ? 1 : n_rows;

        if (n_cols != this.n_cols || n_rows != this.n_rows) {
            console.log(`Updating size: cols: ${this.n_cols} -> ${n_cols}, rows: ${this.n_rows} -> ${n_rows}, rows_in_block: ${this.rows_in_block} -> ${n_rows * 3}`);

            this.n_cols = n_cols;
            this.n_rows = n_rows;
            this.rows_in_block = this.n_rows;
            
            this.rebuild();
        }
    }

    rebuild() {
        this.active = true;
        this.clusterize.destroy();
        this.clusterize = new Clusterize(
            {
                rows: this.filter_rows(this.data_obj),
                scrollId: this.scroll_id,
                contentId: this.content_id,
                rows_in_block: this.rows_in_block,
                blocks_in_cluster: this.blocks_in_cluster,
                show_no_data_row: this.show_no_data_row,
                no_data_text: this.no_data_text,
                no_data_class: this.no_data_class,
                callbacks: this.callbacks,
            }
        );
        this.apply_sort();
    }
}

class ExtraNetworksClusterizeTreeList extends ExtraNetworksClusterize {
    constructor(...args) {
        super(...args);
    }

    update_json(json) {
        for (const [k, v] of Object.entries(json)) {
            let div_id = k;
            let parsed_html = parseHTML(v)[0];
            // parent_id = -1 if item is at root level
            let parent_id = "parentId" in parsed_html.dataset ? parsed_html.dataset.parentId : -1;
            let expanded = "expanded" in parsed_html.dataset;
            let depth = Number(parsed_html.dataset.depth);
            parsed_html.style.paddingLeft = `${depth}em`;
            parsed_html.style.boxShadow = getBoxShadow(depth);
            // Add the updated html to the data object.
            this.data_obj[div_id] = {
                element: parsed_html,
                active: parent_id === -1, // always show root
                expanded: expanded || (parent_id === -1), // always expand root
                parent: parent_id,
                children: [], // populated later
            };
        }

        // Build list of children for each element in dataset.
        for (const [k, v] of Object.entries(this.data_obj)) {
            if (v.parent === -1) {
                continue;
            } else if (!(v.parent in this.data_obj)) {
                console.error("parent not in data:", v.parent);
            } else {
                this.data_obj[v.parent].children.push(k);
            }
        }

        // Handle expanding of rows on initial load
        for (const [k, v] of Object.entries(this.data_obj)) {
            if (v.parent === -1) {
                // Always show root level.
                this.data_obj[k].active = true;
            } else if (this.data_obj[v.parent].expanded && this.data_obj[v.parent].active) {
                // Parent is both active and expanded. show child
                this.data_obj[k].active = true;
            } else {
                this.data_obj[k].active = false;
            }
        }

        this.apply_sort();
    }

    remove_child_rows(div_id) {
        for (const child_id of this.data_obj[div_id].children) {
            this.data_obj[child_id].active = false;
            this.data_obj[child_id].expanded = false;
            delete this.data_obj[child_id].element.dataset.expanded;
            this.remove_child_rows(child_id);
        }
    }
    
    add_child_rows(div_id) {
        for (const child_id of this.data_obj[div_id].children) {
            this.data_obj[child_id].active = true;
            if (this.data_obj[child_id].expanded) {
                this.add_child_rows(child_id);
            }
        }
    }
}

class ExtraNetworksClusterizeCardsList extends ExtraNetworksClusterize {
    constructor(...args) {
        super(...args);

        this.sort_mode_str = "default";
        this.sort_dir_str = "ascending";
        this.filter_str = "";
    }

    update_json(json) {
        for (const [k, v] of Object.entries(json)) {
            let div_id = k;
            let parsed_html = parseHTML(v)[0];
            // Add the updated html to the data object.
            this.data_obj[div_id] = {
                element: parsed_html,
                active: true,
            };
        }

        this.apply_sort();
    }

    filter_rows(obj) {
        let filtered_rows = super.filter_rows(obj);
        let res = [];
        for (let i = 0; i < filtered_rows.length; i += this.n_cols) {
            res.push(filtered_rows.slice(i, i + this.n_cols).join(""));
        }
        return res;
    }

    sort_by_name() {
        this.data_obj_keys_sorted = Object.keys(this.data_obj).sort((a, b) => {
            return STR_COLLATOR.compare(
                this.data_obj[a].element.dataset.sortName,
                this.data_obj[b].element.dataset.sortName,
            );
        });
    }

    sort_by_path() {
        this.data_obj_keys_sorted = Object.keys(this.data_obj).sort((a, b) => {
            return STR_COLLATOR.compare(
                this.data_obj[a].element.dataset.sortPath,
                this.data_obj[b].element.dataset.sortPath,
            );
        });
    }

    sort_by_created() {
        this.data_obj_keys_sorted = Object.keys(this.data_obj).sort((a, b) => {
            return INT_COLLATOR.compare(
                this.data_obj[a].element.dataset.sortCreated,
                this.data_obj[b].element.dataset.sortCreated,
            );
        });
    }

    sort_by_modified() {
        this.data_obj_keys_sorted = Object.keys(this.data_obj).sort((a, b) => {
            return INT_COLLATOR.compare(
                this.data_obj[a].element.dataset.sortModified,
                this.data_obj[b].element.dataset.sortModified,
            );
        });
    }

    set_sort_mode(btn_sort_mode) {
        this.sort_mode_str = btn_sort_mode.dataset.sortMode.toLowerCase();
    }

    set_sort_dir(btn_sort_dir) {
        this.sort_dir_str = btn_sort_dir.dataset.sortDir.toLowerCase();
    }

    apply_sort() {
        this.sort_reverse = this.sort_dir_str === "descending";

        switch(this.sort_mode_str) {
            case "name":
                this.sort_fn = this.sort_by_name;
                break;
            case "path":
                this.sort_fn = this.sort_by_path;
                break;
            case "created":
                this.sort_fn = this.sort_by_created;
                break;
            case "modified":
                this.sort_fn = this.sort_by_modified;
                break;
            default:
                this.sort_fn = this.sort_by_div_id;
                break;
        }
        super.apply_sort();
    }

    apply_filter(filter_str) {
        if (filter_str !== undefined) {
            this.filter_str = filter_str.toLowerCase();
        }
        
        for (const [k, v] of Object.entries(this.data_obj)) {
            let search_only = v.element.querySelector(".search_only");
            let text = Array.prototype.map.call(v.element.querySelectorAll(".search_terms"), function(t) {
                return t.textContent.toLowerCase();
            }).join(" ");

            let visible = text.indexOf(this.filter_str) != -1;
            if (search_only && this.filter_str.length < 4) {
                visible = false;
            }
            this.data_obj[k].active = visible;
        }

        this.apply_sort();
        this.update_rows();
    }
}

function delegate(target, event_name, selector, handler) {
    target.addEventListener(event_name, (event) => {
        if (event.target.closest(selector)) {
            handler.call(event.target, event);
        }
    });
}

function extraNetworksCopyCardPath(event, path) {
    navigator.clipboard.writeText(path);
    event.stopPropagation();
}


function setupExtraNetworkEventDelegators() {
    // Using event delegation will make it so we don't have an event handler
    // for every single element. This helps to improve performance.
}

function toggleCss(key, css, enable) {
    var style = document.getElementById(key);
    if (enable && !style) {
        style = document.createElement('style');
        style.id = key;
        style.type = 'text/css';
        document.head.appendChild(style);
    }
    if (style && !enable) {
        document.head.removeChild(style);
    }
    if (style) {
        style.innerHTML == '';
        style.appendChild(document.createTextNode(css));
    }
}

function setup_proxy_listener(target, pre_handler, post_handler) {
    var proxy = new Proxy(target, {
        set: function (t, k, v) {
            pre_handler.call(t, k, v);
            t[k] = v;
            post_handler.call(t, k, v);
            return true;
        }
    });
    return proxy
}

function on_json_will_update(k, v) {
    // use `this` for current object
}

function on_json_updated(k, v) {
    // use `this` for current object
    // We don't do error handling here because 
    if (k.endsWith("_tree_view")) {
        let _k = k.slice(0, -("_tree_view").length);
        if (!(_k in clusterizers) || !("tree_list" in clusterizers[_k])) {
            return;
        }
        Promise.resolve(v)
            .then(_v => decompress(_v))
            .then(_v => JSON.parse(_v))
            .then(_v => clusterizers[_k].tree_list.update_json(_v));
    } else if (k.endsWith("_cards_view")) {
        let _k = k.slice(0, -("_cards_view").length);
        if (!(_k in clusterizers) || !("cards_list" in clusterizers[_k])) {
            return;
        }
        Promise.resolve(v)
            .then(_v => decompress(_v))
            .then(_v => JSON.parse(_v))
            .then(_v => clusterizers[_k].cards_list.update_json(_v));
    } else {
        console.error("Unknown key in json listener object:", k, v);
    }
}

const extra_networks_json_proxy = {};
const extra_networks_proxy_listener = setup_proxy_listener(
    extra_networks_json_proxy,
    on_json_will_update,
    on_json_updated,
);

function clusterize_setup_done(clusterize) {
}

const clusterizers = {};
function setupExtraNetworksForTab(tabname) {
    function registerPrompt(tabname, id) {
        var textarea = gradioApp().querySelector(`#${id} > label > textarea`);

        if (!activePromptTextarea[tabname]) {
            activePromptTextarea[tabname] = textarea;
        }

        textarea.addEventListener("focus", function() {
            activePromptTextarea[tabname] = textarea;
        });
    }

    var tabnav = gradioApp().querySelector(`#${tabname}_extra_tabs > div.tab-nav`);
    var controlsDiv = document.createElement('DIV');
    controlsDiv.classList.add('extra-networks-controls-div');
    tabnav.appendChild(controlsDiv);
    tabnav.insertBefore(controlsDiv, null);

    var this_tab = gradioApp().querySelector(`#${tabname}_extra_tabs`);
    this_tab.querySelectorAll(`:scope > [id^="${tabname}_"]`).forEach(function(elem) {
        let tabname_full = elem.id;
        let txt_search = gradioApp().querySelector(`#${tabname_full}_extra_search`);
        let btn_sort_mode = gradioApp().querySelector(`#${tabname_full}_extra_sort_mode`);
        let btn_sort_dir = gradioApp().querySelector(`#${tabname_full}_extra_sort_dir`);
        let btn_refresh = gradioApp().querySelector(`#${tabname_full}_extra_refresh`);

        // If any of the buttons above don't exist, we want to skip this iteration of the loop.
        if (!txt_search || !btn_sort_mode || !btn_sort_dir || !btn_refresh) {
            return; // `return` is equivalent of `continue` but for forEach loops.
        }

        if (!(tabname_full in clusterizers)) {
            clusterizers[tabname_full] = {tree_list: undefined, cards_list: undefined};
        }

        // Add a clusterizer for the tree list and for the cards list.
        clusterizers[tabname_full].tree_list = new ExtraNetworksClusterizeTreeList(
            {
                scroll_id: `${tabname_full}_tree_list_scroll_area`,
                content_id: `${tabname_full}_tree_list_content_area`,
            }
        );
        clusterizers[tabname_full].cards_list = new ExtraNetworksClusterizeCardsList(
            {
                scroll_id: `${tabname_full}_cards_list_scroll_area`,
                content_id: `${tabname_full}_cards_list_content_area`,
            }
        );


        var resize_timer;
        window.addEventListener('resize', () => {
            clearTimeout(resize_timer);
            resize_timer = setTimeout(function() {
                clusterizers[tabname_full].tree_list.update_item_dims();
                clusterizers[tabname_full].cards_list.update_item_dims();
            }, 1000); // 100ms
        });

        var apply_filter = function() {
            clusterizers[tabname_full].cards_list.set_sort_mode(btn_sort_mode);
            clusterizers[tabname_full].cards_list.set_sort_dir(btn_sort_dir);
            clusterizers[tabname_full].cards_list.apply_filter(txt_search.value);
        };

        var apply_sort = function() {
            clusterizers[tabname_full].cards_list.set_sort_mode(btn_sort_mode);
            clusterizers[tabname_full].cards_list.set_sort_dir(btn_sort_dir);
            clusterizers[tabname_full].cards_list.apply_sort();
        };

        let typing_timer;
        let done_typing_interval = 500;
        txt_search.addEventListener("keyup", () => {
            clearTimeout(typing_timer);
            if (txt_search.value) {
                typing_timer = setTimeout(apply_filter, done_typing_interval);
            }
        });

        apply_filter(); // also sorts

        extraNetworksApplySort[tabname_full] = apply_sort;
        extraNetworksApplyFilter[tabname_full] = apply_filter;

        var controls = gradioApp().querySelector("#" + tabname_full + "_controls");
        controlsDiv.insertBefore(controls, null);

        if (elem.style.display != "none") {
            extraNetworksShowControlsForPage(tabname, tabname_full);
        }
    });

    registerPrompt(tabname, tabname + "_prompt");
    registerPrompt(tabname, tabname + "_neg_prompt");
}

function extraNetworksMovePromptToTab(tabname, id, showPrompt, showNegativePrompt) {
    if (!gradioApp().querySelector('.toprow-compact-tools')) return; // only applicable for compact prompt layout

    var promptContainer = gradioApp().getElementById(tabname + '_prompt_container');
    var prompt = gradioApp().getElementById(tabname + '_prompt_row');
    var negPrompt = gradioApp().getElementById(tabname + '_neg_prompt_row');
    var elem = id ? gradioApp().getElementById(id) : null;

    if (showNegativePrompt && elem) {
        elem.insertBefore(negPrompt, elem.firstChild);
    } else {
        promptContainer.insertBefore(negPrompt, promptContainer.firstChild);
    }

    if (showPrompt && elem) {
        elem.insertBefore(prompt, elem.firstChild);
    } else {
        promptContainer.insertBefore(prompt, promptContainer.firstChild);
    }

    if (elem) {
        elem.classList.toggle('extra-page-prompts-active', showNegativePrompt || showPrompt);
    }
}


function extraNetworksShowControlsForPage(tabname, tabname_full) {
    gradioApp().querySelectorAll('#' + tabname + '_extra_tabs .extra-networks-controls-div > div').forEach(function(elem) {
        var targetId = tabname_full + "_controls";
        elem.style.display = elem.id == targetId ? "" : "none";
    });
}


function extraNetworksUnrelatedTabSelected(tabname) { // called from python when user selects an unrelated tab (generate)
    extraNetworksMovePromptToTab(tabname, '', false, false);

    extraNetworksShowControlsForPage(tabname, null);
    console.log("extraNetworksUnrelatedTabSelected:", tabname);
}

var extra_networks_resize_handle_fns = {};
function extraNetworksTabSelected(tabname, id, showPrompt, showNegativePrompt, tabname_full) { // called from python when user selects an extra networks tab
    extraNetworksMovePromptToTab(tabname, id, showPrompt, showNegativePrompt);
    extraNetworksShowControlsForPage(tabname, tabname_full);
    console.log("extraNetworksTabSelected:", tabname, id, tabname_full);
    for (_tabname_full of Object.keys(clusterizers)) {
        if (_tabname_full !== tabname_full) {
            clusterizers[_tabname_full].tree_list.active = false;
            clusterizers[_tabname_full].cards_list.active = false;
            window.removeEventListener("resizeHandleResized", extra_networks_resize_handle_fns[_tabname_full]);
        }
    }
    function fn(event) {
        clusterizers[tabname_full].tree_list.update_item_dims();
        clusterizers[tabname_full].cards_list.update_item_dims();
        event.stopPropagation();
    }
    extra_networks_resize_handle_fns[tabname_full] = fn;
    window.addEventListener("resizeHandleResized", fn);
    clusterizers[tabname_full].tree_list.rebuild();
    clusterizers[tabname_full].cards_list.rebuild();
}

function applyExtraNetworkFilter(tabname_full) {
    var doFilter = function() {
        extraNetworksApplyFilter[tabname_full]();
    };
    setTimeout(doFilter, 1);
}

function applyExtraNetworkSort(tabname_full) {
    var doSort = function() {
        extraNetworksApplySort[tabname_full]();
    };
    setTimeout(doSort, 1);
}

function setupExtraNetworksData() {
    for (var elem of gradioApp().querySelectorAll('.extra-networks-script-data')) {
        extra_networks_proxy_listener[elem.dataset.proxyName] = elem.dataset.json;
    }
}

var extraNetworksApplyFilter = {};
var extraNetworksApplySort = {};
var activePromptTextarea = {};

function setupExtraNetworks() {
    setupExtraNetworksForTab('txt2img');
    setupExtraNetworksForTab('img2img');
    setupExtraNetworkEventDelegators();
}

var re_extranet = /<([^:^>]+:[^:]+):[\d.]+>(.*)/;
var re_extranet_g = /<([^:^>]+:[^:]+):[\d.]+>/g;

var re_extranet_neg = /\(([^:^>]+:[\d.]+)\)/;
var re_extranet_g_neg = /\(([^:^>]+:[\d.]+)\)/g;
function tryToRemoveExtraNetworkFromPrompt(textarea, text, isNeg) {
    var m = text.match(isNeg ? re_extranet_neg : re_extranet);
    var replaced = false;
    var newTextareaText;
    var extraTextBeforeNet = opts.extra_networks_add_text_separator;
    if (m) {
        var extraTextAfterNet = m[2];
        var partToSearch = m[1];
        var foundAtPosition = -1;
        newTextareaText = textarea.value.replaceAll(isNeg ? re_extranet_g_neg : re_extranet_g, function(found, net, pos) {
            m = found.match(isNeg ? re_extranet_neg : re_extranet);
            if (m[1] == partToSearch) {
                replaced = true;
                foundAtPosition = pos;
                return "";
            }
            return found;
        });
        if (foundAtPosition >= 0) {
            if (extraTextAfterNet && newTextareaText.substr(foundAtPosition, extraTextAfterNet.length) == extraTextAfterNet) {
                newTextareaText = newTextareaText.substr(0, foundAtPosition) + newTextareaText.substr(foundAtPosition + extraTextAfterNet.length);
            }
            if (newTextareaText.substr(foundAtPosition - extraTextBeforeNet.length, extraTextBeforeNet.length) == extraTextBeforeNet) {
                newTextareaText = newTextareaText.substr(0, foundAtPosition - extraTextBeforeNet.length) + newTextareaText.substr(foundAtPosition);
            }
        }
    } else {
        newTextareaText = textarea.value.replaceAll(new RegExp(`((?:${extraTextBeforeNet})?${text})`, "g"), "");
        replaced = (newTextareaText != textarea.value);
    }

    if (replaced) {
        textarea.value = newTextareaText;
        return true;
    }

    return false;
}

function updatePromptArea(text, textArea, isNeg) {
    if (!tryToRemoveExtraNetworkFromPrompt(textArea, text, isNeg)) {
        textArea.value = textArea.value + opts.extra_networks_add_text_separator + text;
    }

    updateInput(textArea);
}

function cardClicked(tabname, textToAdd, textToAddNegative, allowNegativePrompt) {
    if (textToAddNegative.length > 0) {
        updatePromptArea(textToAdd, gradioApp().querySelector("#" + tabname + "_prompt > label > textarea"));
        updatePromptArea(textToAddNegative, gradioApp().querySelector("#" + tabname + "_neg_prompt > label > textarea"), true);
    } else {
        var textarea = allowNegativePrompt ? activePromptTextarea[tabname] : gradioApp().querySelector("#" + tabname + "_prompt > label > textarea");
        updatePromptArea(textToAdd, textarea);
    }
}

function saveCardPreview(event, tabname, filename) {
    var textarea = gradioApp().querySelector("#" + tabname + '_preview_filename  > label > textarea');
    var button = gradioApp().getElementById(tabname + '_save_preview');

    textarea.value = filename;
    updateInput(textarea);

    button.click();

    event.stopPropagation();
    event.preventDefault();
}

function extraNetworksTreeProcessFileClick(event, btn, tabname, extra_networks_tabname) {
    /**
     * Processes `onclick` events when user clicks on files in tree.
     *
     * @param event                     The generated event.
     * @param btn                       The clicked `tree-list-item` button.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    /*
    cardClicked(
        tabname,
        btn.dataset.prompt,
        btn.dataset.neg_prompt,
        btn.dataset.allow_neg,
    );
    */
    return;
}

function extraNetworksTreeProcessDirectoryClick(event, btn, tabname, extra_networks_tabname) {
    /**
     * Processes `onclick` events when user clicks on directories in tree.
     *
     * Here is how the tree reacts to clicks for various states:
     * unselected unopened directory: Directory is selected and expanded.
     * unselected opened directory: Directory is selected.
     * selected opened directory: Directory is collapsed and deselected.
     * chevron is clicked: Directory is expanded or collapsed. Selected state unchanged.
     *
     * @param event                     The generated event.
     * @param btn                       The clicked `tree-list-item` button.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    // This is the actual target that the user clicked on within the target button.
    // We use this to detect if the chevron was clicked.
    var true_targ = event.target;
    const div_id = btn.dataset.divId;
    const tabname_full = `${tabname}_${extra_networks_tabname}`;

    function _expand_or_collapse(_btn) {
        // Expands/Collapses all children of the button.
        if ("expanded" in _btn.dataset) {
            delete _btn.dataset.expanded;
            clusterizers[tabname_full].tree_list.remove_child_rows(div_id);
        } else {
            _btn.dataset.expanded = "";
            clusterizers[tabname_full].tree_list.add_child_rows(div_id);
        }
        // update html after changing attr.
        clusterizers[tabname_full].tree_list.update_div(div_id, _btn.outerHTML);
        clusterizers[tabname_full].tree_list.update_rows();
    }

    function _remove_selected_from_all() {
        // Removes the `selected` attribute from all buttons.
        var sels = document.querySelectorAll(".tree-list-item");
        [...sels].forEach(el => {
            delete el.dataset.selected;
        });
    }

    function _select_button(_btn) {
        // Removes `data-selected` attribute from all buttons then adds to passed button.
        _remove_selected_from_all();
        _btn.dataset.selected = "";
    }

    function _update_search(_tabname, _extra_networks_tabname, _search_text) {
        // Update search input with select button's path.
        var search_input_elem = gradioApp().querySelector("#" + tabname + "_" + extra_networks_tabname + "_extra_search");
        search_input_elem.value = _search_text;
        updateInput(search_input_elem);
        extraNetworksApplyFilter[tabname_full]();
    }


    // If user clicks on the chevron, then we do not select the folder.
    if (true_targ.matches(".tree-list-item-action--leading, .tree-list-item-action-chevron")) {
        _expand_or_collapse(btn);
    } else {
        // User clicked anywhere else on the button.
        if ("selected" in btn.dataset) {
            // If folder is selected, deselect button.
            delete btn.dataset.selected;
            _update_search(tabname, extra_networks_tabname, "");
        } else {
            // If folder is not selected, select it.
            _select_button(btn, tabname, extra_networks_tabname);
            _update_search(tabname, extra_networks_tabname, btn.dataset.path);
        }
    }
}

function extraNetworksTreeOnClick(event, tabname, extra_networks_tabname) {
    /**
     * Handles `onclick` events for buttons within an `extra-network-tree .tree-list--tree`.
     *
     * Determines whether the clicked button in the tree is for a file entry or a directory
     * then calls the appropriate function.
     *
     * @param event                     The generated event.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    let btn = event.target.closest(".tree-list-item");
    if (btn.dataset.treeEntryType === "file") {
        extraNetworksTreeProcessFileClick(event, btn, tabname, extra_networks_tabname);
    } else {
        extraNetworksTreeProcessDirectoryClick(event, btn, tabname, extra_networks_tabname);
    }
    event.stopPropagation();
}

function extraNetworksControlSortModeOnClick(event, tabname, extra_networks_tabname) {
    /**
     * Handles `onclick` events for the Sort Mode button.
     *
     * Modifies the data attributes of the Sort Mode button to cycle between
     * various sorting modes.
     *
     * @param event                     The generated event.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    switch(event.currentTarget.dataset.sortMode) {
        case "path":
            event.currentTarget.dataset.sortMode = "name";
            event.currentTarget.setAttribute("title", "Sort by filename");
            break;
        case "name":
            event.currentTarget.dataset.sortMode = "date_created";
            event.currentTarget.setAttribute("title", "Sort by date created");
            break;
        case "date_created":
            event.currentTarget.dataset.sortMode = "date_modified";
            event.currentTarget.setAttribute("title", "Sort by date modified");
            break;
        default: // date_modified and all others
            event.currentTarget.dataset.sortMode = "path";
            event.currentTarget.setAttribute("title", "Sort by path");
            break;
    }
    applyExtraNetworkSort(`${tabname}_${extra_networks_tabname}`);
}

function extraNetworksControlSortDirOnClick(event, tabname, extra_networks_tabname) {
    /**
     * Handles `onclick` events for the Sort Direction button.
     *
     * Modifies the data attributes of the Sort Direction button to cycle between
     * ascending and descending sort directions.
     *
     * @param event                     The generated event.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    if (event.currentTarget.dataset.sortDir.toLowerCase() == "ascending") {
        event.currentTarget.dataset.sortDir = "descending";
        event.currentTarget.setAttribute("title", "Sort descending");
    } else {
        event.currentTarget.dataset.sortDir = "ascending";
        event.currentTarget.setAttribute("title", "Sort ascending");
    }
    applyExtraNetworkSort(`${tabname}_${extra_networks_tabname}`);
}

function extraNetworksControlTreeViewOnClick(event, tabname, extra_networks_tabname) {
    /**
     * Handles `onclick` events for the Tree View button.
     *
     * Toggles the tree view in the extra networks pane.
     *
     * @param event                     The generated event.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    const tree = gradioApp().getElementById(`${tabname}_${extra_networks_tabname}_tree_list_scroll_area`);
    const parent = tree.parentElement;
    let resizeHandle = parent.querySelector('.resize-handle');
    tree.classList.toggle("hidden");

    if (tree.classList.contains("hidden")) {
        tree.style.display = 'none';
        parent.style.display = 'flex';
        if (resizeHandle) {
            resizeHandle.style.display = 'none';
        }
    } else {
        tree.style.display = 'block';
        parent.style.display = 'grid';
        if (!resizeHandle) {
            setupResizeHandle(parent);
            resizeHandle = parent.querySelector('.resize-handle');
        }
        resizeHandle.style.display = 'block';
    }
    event.currentTarget.classList.toggle("extra-network-control--enabled");
}

function extraNetworksControlRefreshOnClick(event, tabname, extra_networks_tabname) {
    /**
     * Handles `onclick` events for the Refresh Page button.
     *
     * In order to actually call the python functions in `ui_extra_networks.py`
     * to refresh the page, we created an empty gradio button in that file with an
     * event handler that refreshes the page. So what this function here does
     * is it manually raises a `click` event on that button.
     *
     * @param event                     The generated event.
     * @param tabname                   The name of the active tab in the sd webui. Ex: txt2img, img2img, etc.
     * @param extra_networks_tabname    The id of the active extraNetworks tab. Ex: lora, checkpoints, etc.
     */
    var btn_refresh_internal = gradioApp().getElementById(tabname + "_" + extra_networks_tabname + "_extra_refresh_internal");
    btn_refresh_internal.dispatchEvent(new Event("click"));
}

var globalPopup = null;
var globalPopupInner = null;

function closePopup() {
    if (!globalPopup) return;
    globalPopup.style.display = "none";
}

function popup(contents) {
    if (!globalPopup) {
        globalPopup = document.createElement('div');
        globalPopup.classList.add('global-popup');

        var close = document.createElement('div');
        close.classList.add('global-popup-close');
        close.addEventListener("click", closePopup);
        close.title = "Close";
        globalPopup.appendChild(close);

        globalPopupInner = document.createElement('div');
        globalPopupInner.classList.add('global-popup-inner');
        globalPopup.appendChild(globalPopupInner);

        gradioApp().querySelector('.main').appendChild(globalPopup);
    }

    globalPopupInner.innerHTML = '';
    globalPopupInner.appendChild(contents);

    globalPopup.style.display = "flex";
}

var storedPopupIds = {};
function popupId(id) {
    if (!storedPopupIds[id]) {
        storedPopupIds[id] = gradioApp().getElementById(id);
    }

    popup(storedPopupIds[id]);
}

function extraNetworksFlattenMetadata(obj) {
    const result = {};

    // Convert any stringified JSON objects to actual objects
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            try {
                const parsed = JSON.parse(obj[key]);
                if (parsed && typeof parsed === 'object') {
                    obj[key] = parsed;
                }
            } catch (error) {
                continue;
            }
        }
    }

    // Flatten the object
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            const nested = extraNetworksFlattenMetadata(obj[key]);
            for (const nestedKey of Object.keys(nested)) {
                result[`${key}/${nestedKey}`] = nested[nestedKey];
            }
        } else {
            result[key] = obj[key];
        }
    }

    // Special case for handling modelspec keys
    for (const key of Object.keys(result)) {
        if (key.startsWith("modelspec.")) {
            result[key.replaceAll(".", "/")] = result[key];
            delete result[key];
        }
    }

    // Add empty keys to designate hierarchy
    for (const key of Object.keys(result)) {
        const parts = key.split("/");
        for (let i = 1; i < parts.length; i++) {
            const parent = parts.slice(0, i).join("/");
            if (!result[parent]) {
                result[parent] = "";
            }
        }
    }

    return result;
}

function extraNetworksShowMetadata(text) {
    try {
        let parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            parsed = extraNetworksFlattenMetadata(parsed);
            const table = createVisualizationTable(parsed, 0);
            popup(table);
            return;
        }
    } catch (error) {
        console.eror(error);
    }

    var elem = document.createElement('pre');
    elem.classList.add('popup-metadata');
    elem.textContent = text;

    popup(elem);
    return;
}

function requestGet(url, data, handler, errorHandler) {
    var xhr = new XMLHttpRequest();
    var args = Object.keys(data).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
    xhr.open("GET", url + "?" + args, true);

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    var js = JSON.parse(xhr.responseText);
                    handler(js);
                } catch (error) {
                    console.error(error);
                    errorHandler();
                }
            } else {
                errorHandler();
            }
        }
    };
    var js = JSON.stringify(data);
    xhr.send(js);
}

function extraNetworksCopyPath(event, path) {
    navigator.clipboard.writeText(path);
    event.stopPropagation();
}

function extraNetworksRequestMetadata(event, extraPage, cardName) {
    var showError = function() {
        extraNetworksShowMetadata("there was an error getting metadata");
    };

    requestGet("./sd_extra_networks/metadata", {page: extraPage, item: cardName}, function(data) {
        if (data && data.metadata) {
            extraNetworksShowMetadata(data.metadata);
        } else {
            showError();
        }
    }, showError);

    event.stopPropagation();
}

var extraPageUserMetadataEditors = {};

function extraNetworksEditUserMetadata(event, tabname, extraPage, cardName) {
    var id = tabname + '_' + extraPage + '_edit_user_metadata';

    var editor = extraPageUserMetadataEditors[id];
    if (!editor) {
        editor = {};
        editor.page = gradioApp().getElementById(id);
        editor.nameTextarea = gradioApp().querySelector("#" + id + "_name" + ' textarea');
        editor.button = gradioApp().querySelector("#" + id + "_button");
        extraPageUserMetadataEditors[id] = editor;
    }

    editor.nameTextarea.value = cardName;
    updateInput(editor.nameTextarea);

    editor.button.click();

    popup(editor.page);

    event.stopPropagation();
}

function extraNetworksRefreshSingleCard(page, tabname, name) {
    requestGet("./sd_extra_networks/get-single-card", {page: page, tabname: tabname, name: name}, function(data) {
        if (data && data.html) {
            var card = gradioApp().querySelector(`#${tabname}_${page.replace(" ", "_")}_cards > .card[data-name="${name}"]`);

            var newDiv = document.createElement('DIV');
            newDiv.innerHTML = data.html;
            var newCard = newDiv.firstElementChild;

            newCard.style.display = '';
            card.parentElement.insertBefore(newCard, card);
            card.parentElement.removeChild(card);
        }
    });
}

window.addEventListener("keydown", function(event) {
    if (event.key == "Escape") {
        closePopup();
    }
});

/**
 * Setup custom loading for this script.
 * We need to wait for all of our HTML to be generated in the extra networks tabs
 * before we can actually run the `setupExtraNetworks` function.
 * The `onUiLoaded` function actually runs before all of our extra network tabs are
 * finished generating. Thus we needed this new method.
 *
 */

var uiAfterScriptsCallbacks = [];
var uiAfterScriptsTimeout = null;
var executedAfterScripts = false;

function scheduleAfterScriptsCallbacks() {
    clearTimeout(uiAfterScriptsTimeout);
    uiAfterScriptsTimeout = setTimeout(function() {
        executeCallbacks(uiAfterScriptsCallbacks);
    }, 200);
}

onUiLoaded(function() {
    var mutationObserver = new MutationObserver(function(m) {
        let existingSearchfields = gradioApp().querySelectorAll("[id$='_extra_search']").length;
        let neededSearchfields = gradioApp().querySelectorAll("[id$='_extra_tabs'] > .tab-nav > button").length - 2;

        if (!executedAfterScripts && existingSearchfields >= neededSearchfields) {
            mutationObserver.disconnect();
            executedAfterScripts = true;
            scheduleAfterScriptsCallbacks();
        }
    });
    mutationObserver.observe(gradioApp(), {childList: true, subtree: true});
});

uiAfterScriptsCallbacks.push(setupExtraNetworks);
