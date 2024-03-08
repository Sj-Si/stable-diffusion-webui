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

class ExtraNetworksClusterize {
    constructor(
        {
            data_json_path,
            scroll_id,
            content_id,
            done_fn,
            rows_in_block = 10,
            blocks_in_cluster = 4,
            show_no_data_row = true,
            callbacks = {
                clusterWillChange: this.clusterWillChange,
                clusterChanged: this.clusterChanged,
                scrollingProgress: this.scrollingProgress,
            },
        } = {
            rows_in_block: 10,
            blocks_in_cluster: 4,
            show_no_data_row: true,
            callbacks: {
                clusterWillChange: this.clusterWillChange,
                clusterChanged: this.clusterChanged,
                scrollingProgress: this.scrollingProgress,
            },
        }
    ) {
        if (data_json_path === undefined) {
            console.error("data_json_path is undefined!");
        }
        if (scroll_id === undefined) {
            console.error("scroll_id is undefined!");
        }
        if (content_id === undefined) {
            console.error("content_id is undefined!");
        }

        this.data_json_path = data_json_path;
        this.scroll_id = scroll_id;
        this.content_id = content_id;
        this.done_fn = done_fn;
        this.rows_in_block = rows_in_block;
        this.blocks_in_cluster = blocks_in_cluster;
        this.show_no_data_row = show_no_data_row;
        this.callbacks = {};//callbacks;

        this.sort_fn = this.sort_by_id; // default sort by div_id
        this.sort_asc = true; // default 0->9, A->Z

        this.data_obj = {};

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

    clusterWillChange() {
        console.log("clusterWillChange");
    }
    
    clusterChanged() {
        console.log("clusterChanged");
    }
    
    scrollingProgress(p) {
        console.log("scrollingProgress:", p);
    }

    sort_by_id(obj) {
        const collator = new Intl.Collator([], {numeric: true});
        var res = Object.keys(obj).sort((a, b) => collator.compare(a, b));
        return this.sort_asc ? res : res.reverse();
    }

    sort_by_name(obj) {
        const collator = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
        var res = Object.keys(obj).sort((a, b) => collator.compare(a, b));
        return this.sort_asc ? res : res.reverse();
    }

    filter_rows(obj) {
        var results = [];
        for (const div_id of this.sort_fn(obj)) {
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

    rebuild() {
        this.clusterize.destroy();
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
        this.parse_json();
    }
}

class ExtraNetworksClusterizeTreeList extends ExtraNetworksClusterize {
    constructor(...args) {
        super(...args);
        this.div_id_children = {};
    }

    parse_json() {
        fetch(this.data_json_path)
            .then(res => res.json())
            .then(res => {
                for (const [k, v] of Object.entries(res)) {
                    let div_id = k;
                    let parsed_html = parseHTML(v)[0];
                    let parent_id = "parentId" in parsed_html.dataset ? parsed_html.dataset.parentId : -1;
                    let depth = Number(parsed_html.dataset.depth);
                    parsed_html.style.paddingLeft = `${depth}em`;
                    parsed_html.style.boxShadow = getBoxShadow(depth);
                    // Add the updated html to the data object.
                    this.data_obj[div_id] = {
                        element: parsed_html,
                        active: false,
                        expanded: "expanded" in parsed_html.dataset,
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
                    if (!(v.parent in this.data_obj) && v.expanded) {
                        this.data_obj[k].active = true;
                    } else if (v.parent !== -1 && this.data_obj[v.parent].expanded && this.data_obj[v.parent].active) {
                        this.data_obj[k].active = true;
                    }
                }

                this.update_rows();
                this.done_fn(this);
            })
            .catch((error) => console.error("Error parsing data JSON:", this.data_json_path, error));
    }

    remove_child_rows(div_id) {
        for (const child_id of this.data_obj[div_id].children) {
            this.data_obj[child_id].active = false;
            this.remove_child_rows(child_id);
        }
    }
    
    add_child_rows(div_id) {
        for (const child_id of this.data_obj[div_id].children) {
            this.data_obj[child_id].active = true;
            this.add_child_rows(child_id);
        }
    }
}

class ExtraNetworksClusterizeCardsList extends ExtraNetworksClusterize {
    constructor(...args) {
        super(...args);
    }

    parse_json() {
        fetch(this.data_json_path)
            .then(res => res.json())
            .then(res => {
                for (const [k, v] of Object.entries(res)) {
                    let div_id = k;
                    let parsed_html = parseHTML(v)[0];
                    // Add the updated html to the data object.
                    this.data_obj[div_id] = {
                        element: parsed_html,
                        active: true,
                    };
                }

                this.update_rows();
                this.done_fn(this);
            })
            .catch((error) => console.error("Error parsing data JSON:", this.data_json_path, error));
    }

    filter(search_str) {
        search_str = search_str.toLowerCase();
        for (const [k, v] of Object.entries(this.data_obj)) {
            let search_only = v.element.querySelector(".search_only");
            let text = Array.prototype.map.call(v.element.querySelectorAll(".search_terms"), function(t) {
                return t.textContent.toLowerCase();
            }).join(" ");

            let visible = text.indexOf(search_str) != -1;
            if (search_only && search_str.length < 4) {
                visible = false;
            }
            this.data_obj[k].active = visible;
            if (!this.update_div(k, v.element)) {
                console.error("error updating div:", k, v);
            }
        }

        this.update_rows();
    }

    sort(order, mode_str, mode_key, force) {
        let reverse = order == "Descending";
        let key = mode_str.toLowerCase().replace("sort", "").replaceAll(" ", "_").replace(/_+$/, "").trim() || "name";
        key = "sort" + key.charAt(0).toUpperCase() + key.slice(1);
        let key_store = key + "-" + (reverse ? "Descending" : "Ascending") + "-" + Object.keys(this.data_obj).length;
        
        if (key_store == mode_key && !force) {
            return;
        }

        let div_ids_sorted = Array.from(Object.keys(this.data_obj));
        div_ids_sorted.sort(function(a, b) {
            
        })
        
        return key_store;
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

function clusterize_setup_done(clusterize) {
}

const clusterizers = {};
function setupExtraNetworksForTab(tabname) {
    function registerPrompt(tabname, id) {
        var textarea = gradioApp().querySelector("#" + id + " > label > textarea");

        if (!activePromptTextarea[tabname]) {
            activePromptTextarea[tabname] = textarea;
        }

        textarea.addEventListener("focus", function() {
            activePromptTextarea[tabname] = textarea;
        });
    }

    var tabnav = gradioApp().querySelector('#' + tabname + '_extra_tabs > div.tab-nav');
    var controlsDiv = document.createElement('DIV');
    controlsDiv.classList.add('extra-networks-controls-div');
    tabnav.appendChild(controlsDiv);
    tabnav.insertBefore(controlsDiv, null);

    var this_tab = gradioApp().querySelector('#' + tabname + '_extra_tabs');
    this_tab.querySelectorAll(":scope > [id^='" + tabname + "_']").forEach(function(elem) {
        // tabname_full = {tabname}_{extra_networks_tabname}
        var tabname_full = elem.id;
        var search = gradioApp().querySelector("#" + tabname_full + "_extra_search");
        var sort_mode = gradioApp().querySelector("#" + tabname_full + "_extra_sort");
        var sort_dir = gradioApp().querySelector("#" + tabname_full + "_extra_sort_dir");
        var refresh = gradioApp().querySelector("#" + tabname_full + "_extra_refresh");

        // If any of the buttons above don't exist, we want to skip this iteration of the loop.
        if (!search || !sort_mode || !sort_dir || !refresh) {
            return; // `return` is equivalent of `continue` but for forEach loops.
        }

        if (!(tabname_full in clusterizers)) {
            clusterizers[tabname_full] = {tree_list: undefined, cards_list: undefined};
        }

        // Add a clusterizer for the tree list and for the cards list.
        clusterizers[tabname_full].tree_list = new ExtraNetworksClusterizeTreeList(
            {
                data_json_path: `./tmpdir/${tabname_full}_tree_list.json`,
                scroll_id: `${tabname_full}_tree_list_scroll_area`,
                content_id: `${tabname_full}_tree_list_content_area`,
                done_fn: clusterize_setup_done,
            }
        );
        clusterizers[tabname_full].cards_list = new ExtraNetworksClusterizeCardsList(
            {
                data_json_path: `./tmpdir/${tabname_full}_cards_list.json`,
                scroll_id: `${tabname_full}_cards_list_scroll_area`,
                content_id: `${tabname_full}_cards_list_content_area`,
                done_fn: clusterize_setup_done,
            }
        );

        var applyFilter = function(force) {
            clusterizers[tabname_full].cards_list.filter(search.value);
            return;
            var searchTerm = search.value.toLowerCase();
            gradioApp().querySelectorAll('#' + tabname + '_extra_tabs div.card').forEach(function(elem) {
                var searchOnly = elem.querySelector('.search_only');
                var text = Array.prototype.map.call(elem.querySelectorAll('.search_terms'), function(t) {
                    return t.textContent.toLowerCase();
                }).join(" ");

                var visible = text.indexOf(searchTerm) != -1;
                if (searchOnly && searchTerm.length < 4) {
                    visible = false;
                }
                if (visible) {
                    //elem.classList.remove("hidden");
                    delete elem.dataset.visible;
                } else {
                    //elem.classList.add("hidden");
                    elem.dataset.visible = "";
                }
            });

            applySort(force);
        };

        var applySort = function(force) {
            var cards = gradioApp().querySelectorAll('#' + tabname + '_extra_tabs div.card');
            var reverse = sort_dir.dataset.sortdir == "Descending";
            var sortKey = sort_mode.dataset.sortmode.toLowerCase().replace("sort", "").replaceAll(" ", "_").replace(/_+$/, "").trim() || "name";
            sortKey = "sort" + sortKey.charAt(0).toUpperCase() + sortKey.slice(1);
            var sortKeyStore = sortKey + "-" + (reverse ? "Descending" : "Ascending") + "-" + cards.length;

            if (sortKeyStore == sort_mode.dataset.sortkey && !force) {
                return;
            }
            sort_mode.dataset.sortkey = sortKeyStore;

            cards.forEach(function(card) {
                card.originalParentElement = card.parentElement;
            });
            var sortedCards = Array.from(cards);
            sortedCards.sort(function(cardA, cardB) {
                var a = cardA.dataset[sortKey];
                var b = cardB.dataset[sortKey];
                if (!isNaN(a) && !isNaN(b)) {
                    return parseInt(a) - parseInt(b);
                }

                return (a < b ? -1 : (a > b ? 1 : 0));
            });
            if (reverse) {
                sortedCards.reverse();
            }
            cards.forEach(function(card) {
                card.remove();
            });
            sortedCards.forEach(function(card) {
                card.originalParentElement.appendChild(card);
            });
        };

        let typing_timer;
        let done_typing_interval = 500;
        search.addEventListener("keyup", () => {
            clearTimeout(typing_timer);
            if (search.value) {
                typing_timer = setTimeout(applyFilter, done_typing_interval);
            }
        });
        applySort();
        applyFilter();
        extraNetworksApplySort[tabname_full] = applySort;
        extraNetworksApplyFilter[tabname_full] = applyFilter;

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

function extraNetworksTabSelected(tabname, id, showPrompt, showNegativePrompt, tabname_full) { // called from python when user selects an extra networks tab
    extraNetworksMovePromptToTab(tabname, id, showPrompt, showNegativePrompt);
    extraNetworksShowControlsForPage(tabname, tabname_full);
    console.log("extraNetworksTabSelected:", tabname, id, tabname_full);
    clusterizers[tabname_full].tree_list.rebuild();
    clusterizers[tabname_full].cards_list.rebuild();
}

function applyExtraNetworkFilter(tabname_full) {
    var doFilter = function() {
        var applyFunction = extraNetworksApplyFilter[tabname_full];

        if (applyFunction) {
            applyFunction(true);
        }
    };
    setTimeout(doFilter, 1);
}

function applyExtraNetworkSort(tabname_full) {
    var doSort = function() {
        extraNetworksApplySort[tabname_full](true);
    };
    setTimeout(doSort, 1);
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

function extraNetworksControlSortOnClick(event, tabname, extra_networks_tabname) {
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
    var curr_mode = event.currentTarget.dataset.sortmode;
    var el_sort_dir = gradioApp().querySelector("#" + tabname + "_" + extra_networks_tabname + "_extra_sort_dir");
    var sort_dir = el_sort_dir.dataset.sortdir;
    if (curr_mode == "path") {
        event.currentTarget.dataset.sortmode = "name";
        event.currentTarget.dataset.sortkey = "sortName-" + sort_dir + "-640";
        event.currentTarget.setAttribute("title", "Sort by filename");
    } else if (curr_mode == "name") {
        event.currentTarget.dataset.sortmode = "date_created";
        event.currentTarget.dataset.sortkey = "sortDate_created-" + sort_dir + "-640";
        event.currentTarget.setAttribute("title", "Sort by date created");
    } else if (curr_mode == "date_created") {
        event.currentTarget.dataset.sortmode = "date_modified";
        event.currentTarget.dataset.sortkey = "sortDate_modified-" + sort_dir + "-640";
        event.currentTarget.setAttribute("title", "Sort by date modified");
    } else {
        event.currentTarget.dataset.sortmode = "path";
        event.currentTarget.dataset.sortkey = "sortPath-" + sort_dir + "-640";
        event.currentTarget.setAttribute("title", "Sort by path");
    }
    applyExtraNetworkSort(tabname + "_" + extra_networks_tabname);
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
    if (event.currentTarget.dataset.sortdir == "Ascending") {
        event.currentTarget.dataset.sortdir = "Descending";
        event.currentTarget.setAttribute("title", "Sort descending");
    } else {
        event.currentTarget.dataset.sortdir = "Ascending";
        event.currentTarget.setAttribute("title", "Sort ascending");
    }
    applyExtraNetworkSort(tabname + "_" + extra_networks_tabname);
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
    const tree = gradioApp().getElementById(tabname + "_" + extra_networks_tabname + "_tree");
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
