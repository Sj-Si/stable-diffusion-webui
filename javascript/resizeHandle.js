// Should be between 0 and 15. Any higher and the delay becomes noticable.
// Higher values reduce computational load.
const MOVE_TIME_DELAY_MS = 15;
// Prevents handling element resize events too quickly. Lower values increase
// computational load and may lead to lag when resizing.
const RESIZE_DEBOUNCE_TIME_MS = 100;
// The timeframe in which a second pointerup event must be fired to be treated
// as a double click.
const DBLCLICK_TIME_MS = 500;
// The padding around the draggable resize handle.
const PAD_PX = 16;

const _gen_id_string = () => {
    return Math.random().toString(16).slice(2);
};

const _parse_array_type = (arr, type_check_fn) => {
    isNullOrUndefinedThrowError(type_check_fn);
    if (isNullOrUndefined(arr)) {
        return [];
    }
    if (!Array.isArray(arr) && type_check_fn(arr)) {
        return [arr];
    } else if (Array.isArray(arr) && arr.every((x) => type_check_fn(x))) {
        return arr;
    } else {
        throw new Error('Invalid array types:', arr);
    }
};

const _axis_to_int = (axis) => {
    if (axis === 0 || axis === 'x') {
        return 0;
    } else if (axis === 1 || axis === 'y') {
        return 1;
    } else {
        throw new Error(`"Axis" expected (x (0), y (1)), got: ${axis}`);
    }
};

class ResizeHandle {
    visible = true;
    id = null; // unique identifier for this instance.
    pad_px = PAD_PX;
    constructor({id, parent, axis, class_list} = {}) {
        this.id = isNullOrUndefined(id) ? _gen_id_string() : id;
        this.parent = parent;
        this.elem = document.createElement('div');
        this.elem.id = id;
        this.elem.classList.add('resize-handle');
        _parse_array_type(class_list, isString).forEach((class_name) => {
            this.elem.classList.add(class_name);
        });

        this.axis = _axis_to_int(axis);

        if (this.axis === 0) {
            this.elem.style.minHeight = this.pad_px + 'px';
            this.elem.style.maxHeight = this.pad_px + 'px';
        } else if (this.axis === 1) {
            this.elem.style.minWidth = this.pad_px + 'px';
            this.elem.style.maxWidth = this.pad_px + 'px';
        }
    }

    destroy() {
        this.elem.remove();
    }

    show() {
        this.elem.classList.remove('hidden');
        this.visible = true;
    }

    hide() {
        this.elem.classList.add('hidden');
        this.visible = false;
    }
}

class ResizeHandleItem {
    handle = null;
    visible = true;
    pad_px = PAD_PX;
    constructor({id, parent, elem, axis} = {}) {
        this.id = isNullOrUndefined(id) ? _gen_id_string() : id;
        this.parent = parent; // the parent class instance
        this.elem = elem;
        this.axis = _axis_to_int(axis);

        this.is_flex_grow = Boolean(parseInt(this.elem.style.flexGrow));
        this.default_is_flex_grow = this.is_flex_grow;
        let flex_basis = parseFloat(this.elem.style.flexBasis);

        if (isNumber(flex_basis)) {
            this.min_size = flex_basis;
        } else {
            this.min_size = 0;
        }

        this.elem.dataset.id = this.id;
        this.original_css_text = this.elem.style.cssText;
    }

    render() {
        this.elem.style.flexShrink = 0;
        this.elem.style.flexGrow = Number(this.is_flex_grow);
        this.dims = this.getDims(true);
        const size = this.axis === 0 ? this.dims.height : this.dims.width;
        this.elem.style.flexBasis = Math.max(this.min_size, size) + 'px';
    }

    destroy() {
        if (!isNullOrUndefined(this.handle)) {
            this.handle.destroy();
            this.handle = null;
        }
        // Revert changes to the container element.
        this.elem.style.cssText = this.original_css_text;
        if (!this.elem.style.cssText) {
            this.elem.removeAttribute('style');
        }
    }

    shrink(px) {
        /** Shrink size along axis by specified pixels up to this.min_size. Return remainder. */
        const curr_size = parseFloat(this.elem.style.flexBasis);
        if (px === -1) {
            // shrink to min_size
            this.elem.style.flexBasis = this.min_size + 'px';
            return 0;
        } else if (curr_size - this.min_size < px) {
            this.elem.style.flexBasis = this.min_size + 'px';
            return px - (curr_size - this.min_size);
        } else {
            this.elem.style.flexBasis = curr_size - px + 'px';
            return 0;
        }
    }

    grow(px, only_if_flex) {
        /** Grows along axis and returns the amount grown in pixels. */
        only_if_flex = only_if_flex === true;
        if (only_if_flex && !this.is_flex_grow) {
            return 0;
        }
        let new_size;
        const curr_size = parseFloat(this.elem.style.flexBasis);
        if (px === -1) {
            // grow to fill container (only works if visible)
            // set flexGrow to 1 to expand to max width so we can calc new width.
            this.elem.style.flexGrow = 1;
            const dims = this.getDims(true);
            this.elem.style.flexGrow = Number(this.is_flex_grow);
            new_size = this.axis === 0 ? dims.height : dims.width;
        } else {
            new_size = curr_size + px;
        }
        this.elem.style.flexBasis = new_size + 'px';
        return new_size - curr_size;
    }

    getDims(update) {
        if (update) {
            this.dims = this.elem.getBoundingClientRect();
        }
        return this.dims;
    }

    genResizeHandle(class_list) {
        this.handle = new ResizeHandle({
            id: `${this.id}_handle`,
            parent: this.parent,
            axis: this.axis,
            class_list: class_list,
        });
        if (isElement(this.elem.nextElementSibling)) {
            this.elem.parentElement.insertBefore(
                this.handle.elem,
                this.elem.nextSibling
            );
        } else {
            this.elem.parentElement.appendChild(this.handle.elem);
        }
    }

    show() {
        this.elem.classList.remove('hidden');
        if (!isNullOrUndefined(this.handle.elem.nextSibling)) {
            this.handle.show();
        }
        this.visible = true;
    }

    hide() {
        this.elem.classList.add('hidden');
        this.handle.hide();
        this.visible = false;
    }
}

class ResizeHandleGrid {
    constructor({id, parent, elem} = {}) {
        this.id = isNullOrUndefined(id) ? _gen_id_string() : id;
        this.parent = parent;
        this.elem = elem;
        this.original_css_text = this.elem.style.cssText;

        this.grid = [];
        this.rows = [];
        this.id_map = {};
        this.added_outer_row = false;
    }

    destroy() {
        this.rows.forEach((row) => {
            row.destroy();
        });
        this.rows = null;
        if (this.added_outer_row) {
            this.elem.innerHTML = this.elem.querySelector(
                ':scope > .resize-handle-row'
            ).innerHTML;
        }
        super.destroy();
    }

    addRow(id, elem, row_idx) {
        const row = new ResizeHandleItem({
            id: id,
            parent: this,
            elem: elem,
            axis: 0,
        });
        row.genResizeHandle('resize-handle--row');
        row.elem.dataset.row = row_idx;
        this.rows.push(row);
        this.id_map[id] = row;
        return row;
    }

    addCol(id, elem, row_idx, col_idx) {
        const col = new ResizeHandleItem({
            id: id,
            parent: this,
            elem: elem,
            axis: 1,
        });
        col.genResizeHandle('resize-handle--col');
        col.elem.dataset.row = row_idx;
        col.elem.dataset.col = col_idx;
        this.grid[row_idx].push(col);
        this.id_map[id] = col;
        return col;
    }

    getBoundingDims() {
        let width = 0;
        let height = 0;

        this.rows.forEach((row) => {
            height += row.elem.getBoundingClientRect().height;
        });

        this.grid.forEach((row) => {
            let row_width = 0;
            row.forEach((col) => {
                row_width += col.elem.getBoundingClientRect().width;
            });
            width = Math.max(width, row_width);
        });

        return {width: width, height: height};
    }

    build() {
        let row_elems = Array.from(
            this.elem.querySelectorAll('.resize-handle-row')
        );
        if (!row_elems.length) {
            const elem = document.createElement('div');
            elem.classList.add('resize-handle-row');
            elem.append(...this.elem.children);
            this.elem.replaceChildren(elem);
            row_elems = [elem];
            this.added_outer_row = true;
        }

        if (row_elems.length === 1 && !row_elems[0].style.flexBasis) {
            row_elems[0].style.flexBasis =
                parseFloat(this.elem.getBoundingClientRect().height) + 'px';
        }

        let id = 0;
        this.grid = [...Array(row_elems.length)].map((_) => []);
        row_elems.forEach((row_elem, i) => {
            this.addRow(id++, row_elem, i);
            const col_elems = row_elem.querySelectorAll('.resize-handle-col');
            col_elems.forEach((col_elem, j) => {
                this.addCol(id++, col_elem, i, j);
            });
            this.grid[i][this.grid[i].length - 1].handle.hide();
        });
        this.rows[this.rows.length - 1].handle.hide();

        const dims = this.getBoundingDims();

        this.elem.style.minWidth = dims.width + 'px';
        this.elem.style.minHeight = dims.height + 'px';

        // Now that all handles are added, we need to render the flex styles for each item.
        for (let i = 0; i < this.rows.length; i++) {
            this.rows[i].render();
            for (let j = 0; j < this.grid[i].length; j++) {
                this.grid[i][j].render();
            }
        }
    }

    getByElem(elem) {
        return this.id_map[elem.dataset.id];
    }

    getByIdx({row_idx, col_idx} = {}) {
        if (
            (!isNumber(row_idx) && !isNumber(col_idx)) ||
            (!isNumber(row_idx) && isNumber(col_idx))
        ) {
            console.error('Invalid row/col idx:', row_idx, col_idx);
            return;
        }
        if (isNumber(row_idx) && !isNumber(col_idx)) {
            if (row_idx >= this.rows.length) {
                console.error(
                    `row_idx out of range: (${row_idx} > ${this.rows.length})`
                );
                return;
            }
            return this.rows[row_idx];
        }
        if (isNumber(row_idx) && isNumber(col_idx)) {
            if (row_idx >= this.grid.length) {
                console.error(
                    `row_idx out of range: (${row_idx} > ${this.grid.length})`
                );
                return;
            }
            if (col_idx >= this.grid[row_idx].length) {
                console.error(
                    `col_idx out of range: (${col_idx} > ${this.grid[row_idx].length})`
                );
                return;
            }
            return this.grid[row_idx][col_idx];
        }
    }

    updateVisibleHandles() {
        const last_vis_rows_idx = this.rows.findLastIndex((x) => x.visible);
        for (let i = 0; i < this.rows.length; i++) {
            const last_vis_grid_idx = this.grid[i].findLastIndex((x) => x.visible);
            for (let j = 0; j < this.grid[i].length; j++) {
                const item = this.getByIdx({row_idx: i, col_idx: j});
                if (isNullOrUndefined(item)) {
                    continue;
                }

                // Don't show handle if it is last column in row.
                if (this.grid[i][j].visible && j !== last_vis_grid_idx) {
                    this.grid[i][j].handle.show();
                } else {
                    this.grid[i][j].handle.hide();
                }
            }

            const item = this.getByIdx({row_idx: i});
            if (isNullOrUndefined(item)) {
                continue;
            }

            // Don't show handle if it is last row in grid.
            if (this.rows[i].visible && i !== last_vis_rows_idx) {
                this.rows[i].handle.show();
            } else {
                this.rows[i].handle.hide();
            }
        }
    }

    show({row_idx, col_idx} = {}) {
        const item = this.getByIdx({row_idx: row_idx, col_idx: col_idx});
        isNullOrUndefinedThrowError(item);

        if (item.visible) {
            return;
        }

        if (item.axis === 0 && this.grid[row_idx].every((x) => !x.visible)) {
            // Can't show row since all cols are invisible. Do nothing.
            for (const col of this.grid[row_idx]) {
                col.show();
                col.render();
            }
            item.show();
        }

        if (item.axis === 1 && !this.rows[row_idx].visible) {
            // Can't show column since row is invisible. Do nothing.
            return;
        }

        const siblings = item.axis === 0 ? this.rows : this.grid[row_idx];

        // Showing element in an empty row/col. Don't need to make any room for it.
        if (siblings.every((x) => !x.visible)) {
            item.show();
            //item.handle.hide();
            item.elem.style.flexGrow = 1;
            const dims = item.elem.getBoundingClientRect();
            item.elem.style.flexBasis =
                (item.axis === 0 ? dims.height : dims.width) + 'px';
            item.elem.style.flexGrow = Number(item.is_flex_grow);
            // Don't need to make room for elem so we just return.
            return;
        }

        // Make room for the item to be shown.
        let rem = parseFloat(item.elem.style.flexBasis) + item.pad_px;
        // Shrink from the element after this item's handle first.
        let sibling;
        const item_idx = item.axis === 0 ? row_idx : col_idx;
        sibling = siblings.slice(item_idx).find((x) => x.visible);
        if (isNullOrUndefined(sibling)) {
            sibling = siblings.slice(0, item_idx).findLast((x) => x.visible);
        }
        // TODO: Make sure sibling isnt ever null.
        rem = sibling.shrink(rem);
        // Shrink from flexGrow items first if they are visible.
        let items = siblings.filter((x) => x.is_flex_grow && x.visible);
        for (const other of items) {
            rem = other.shrink(rem);
        }

        // If we still don't have room, shrink non-flexGrow items.
        if (rem > 0) {
            items = siblings.filter((x) => !x.is_flex_grow && x.visible);
            for (const other of siblings.slice().reverse()) {
                rem = other.shrink(rem);
            }
        }

        // If we still don't have room, try shrinking the item we're adding.
        if (rem > 0) {
            rem = item.shrink(rem);
        }

        if (rem > 0) {
            // This indicates a programmer error.
            throw new Error(`Could not allocate room to show item: ${rem}px`);
        }

        // Show the item now that we have room.
        item.show();
        // Update our visibility mappings.
        if (isNumber(row_idx) && isNumber(col_idx)) {
            // If we are showing a column, then its containing row must also be shown.
            this.show({row_idx: row_idx});
        }
    }

    hide({row_idx, col_idx} = {}) {
        const item = this.getByIdx({row_idx: row_idx, col_idx: col_idx});
        isNullOrUndefinedThrowError(item);

        if (!item.visible) {
            return;
        }

        if (item.axis === 1 && !this.rows[row_idx].visible) {
            // Can't hide column since its containing row is already hidden.
            return;
        }

        let sibling;
        const siblings = item.axis === 0 ? this.rows : this.grid[row_idx];
        const item_idx = item.axis === 0 ? row_idx : col_idx;
        //const dims = item.elem.getBoundingClientRect();
        let rem = parseFloat(item.elem.style.flexBasis) + item.pad_px;
        //let rem = (item.axis === 0 ? dims.height : dims.width) + item.pad_px;
        // Hide the item.
        item.hide();
        if (isNumber(row_idx) && isNumber(col_idx)) {
            // If we have a whole row with no visible columns, then hide that row.
            if (this.grid[row_idx].every((x) => !x.visible)) {
                this.hide({row_idx: row_idx});
                // we don't want to continue if we are hiding the row.
                return;
            }
        }

        if (siblings.every((x) => !x.visible)) {
            // No elements visible. Do nothing.
            return;
        }

        // Now expand other items to fill the new space.

        // Expand the item that was attached via the hidden item's handle.
        sibling = siblings.slice(item_idx).find((x) => x.visible);
        if (isNullOrUndefined(sibling)) {
            sibling = siblings.slice(0, item_idx).findLast((x) => x.visible);
        }
        isNullOrUndefinedThrowError(sibling);

        rem = sibling.grow(rem);
    }
}

class ResizeHandleContainer {
    event_abort_controller = null;
    added_outer_row = false;
    grid = null;
    constructor(elem) {
        this.elem = elem;
        this.prev_dims = this.elem.getBoundingClientRect();
    }

    destroy() {
        this.destroyEvents();
        if (!isNullOrUndefined(this.grid)) {
            this.grid.destroy();
            this.grid = null;
        }
    }

    setup() {
        if (!this.elem.querySelector('.resize-handle-row,.resize-handle-col')) {
            throw new Error('Container has no rows or cols.');
        }

        if (!isNullOrUndefined(this.grid)) {
            this.grid.destroy();
            this.grid = null;
        }

        this.grid = new ResizeHandleGrid(this, null, this.elem);
        this.grid.build();
        this.setupEvents();
    }

    setupEvents() {
        this.event_abort_controller = new AbortController();
        let prev;
        let handle;
        let next;
        let touch_count = 0;

        let dblclick_timer;
        let resize_timer;

        let last_move_time;

        window.addEventListener(
            'pointerdown',
            (event) => {
                if (event.target.hasPointerCapture(event.pointerId)) {
                    event.target.releasePointerCapture(event.pointerId);
                }
                if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                }
                if (event.pointerType === 'touch') {
                    touch_count++;
                    if (touch_count !== 1) {
                        return;
                    }
                }

                const elem = event.target.closest('.resize-handle');
                if (!elem) {
                    return;
                }
                // Handles will always be between two elements.
                prev = this.grid.getByElem(elem.previousElementSibling);
                if (!prev.visible) {
                    const row_idx = prev.elem.dataset.row;
                    const col_idx = prev.elem.dataset.col;
                    const siblings =
                        prev.axis === 0 ? this.grid.rows : this.grid.grid[row_idx];
                    const idx = prev.axis === 0 ? row_idx : col_idx;
                    prev = siblings.slice(0, idx).findLast((x) => x.visible);
                }
                handle = prev.handle;
                next = this.grid.getByElem(elem.nextElementSibling);
                if (!next.visible) {
                    const row_idx = next.elem.dataset.row;
                    const col_idx = next.elem.dataset.col;
                    const siblings =
                        next.axis === 0 ? this.grid.rows : this.grid.grid[row_idx];
                    const idx = next.axis === 0 ? row_idx : col_idx;
                    next = siblings.slice(idx).find((x) => x.visible);
                }

                if (
                    isNullOrUndefinedLogError(prev) ||
                    isNullOrUndefinedLogError(handle) ||
                    isNullOrUndefinedLogError(next)
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                handle.elem.setPointerCapture(event.pointerId);

                document.body.classList.add('resizing');
                if (handle.axis === 0) {
                    document.body.classList.add('resizing-col');
                } else {
                    document.body.classList.add('resizing-row');
                }

                prev.getDims(true);
                next.getDims(true);
            },
            {signal: this.event_abort_controller.signal}
        );

        window.addEventListener(
            'pointermove',
            (event) => {
                if (
                    isNullOrUndefined(prev) ||
                    isNullOrUndefined(handle) ||
                    isNullOrUndefined(next)
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const now = new Date().getTime();
                if (!last_move_time || now - last_move_time > MOVE_TIME_DELAY_MS) {
                    this.onMove(event, prev, handle, next);
                    last_move_time = now;
                }
            },
            {signal: this.event_abort_controller.signal}
        );

        window.addEventListener(
            'pointerup',
            (event) => {
                if (
                    isNullOrUndefined(prev) ||
                    isNullOrUndefined(handle) ||
                    isNullOrUndefined(next)
                ) {
                    return;
                }

                if (event.target.hasPointerCapture(event.pointerId)) {
                    event.target.releasePointerCapture(event.pointerId);
                }

                if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                }
                if (event.pointerType === 'touch') {
                    touch_count--;
                }

                event.preventDefault();
                event.stopPropagation();

                handle.elem.releasePointerCapture(event.pointerId);

                document.body.classList.remove('resizing');
                document.body.classList.remove('resizing-col');
                document.body.classList.remove('resizing-row');

                if (!dblclick_timer) {
                    handle.elem.dataset.awaitDblClick = '';
                    dblclick_timer = setTimeout(
                        (elem) => {
                            dblclick_timer = null;
                            delete elem.dataset.awaitDblClick;
                        },
                        DBLCLICK_TIME_MS,
                        handle.elem
                    );
                } else if ('awaitDblClick' in handle.elem.dataset) {
                    clearTimeout(dblclick_timer);
                    dblclick_timer = null;
                    delete handle.elem.dataset.awaitDblClick;
                    handle.elem.dispatchEvent(
                        new CustomEvent('resize_handle_dblclick', {
                            bubbles: true,
                            detail: this,
                        })
                    );
                }
                prev = null;
                handle = null;
                next = null;
            },
            {signal: this.event_abort_controller.signal}
        );

        window.addEventListener(
            'pointerout',
            (event) => {
                if (event.pointerType === 'touch') {
                    touch_count--;
                }
            },
            {signal: this.event_abort_controller.signal}
        );

        window.addEventListener(
            'resize',
            (event) => {
                clearTimeout(resize_timer);
                resize_timer = setTimeout(() => {
                    this.onResize();
                }, RESIZE_DEBOUNCE_TIME_MS);
                if (event.pointerType === 'touch') {
                    touch_count--;
                }
            },
            {signal: this.event_abort_controller.signal}
        );
    }

    destroyEvents() {
        // We can simplify removal of event listeners by firing an AbortController
        // abort signal. Must pass the signal to any event listeners on creation.
        if (this.event_abort_controller) {
            this.event_abort_controller.abort();
        }
    }

    onMove(event, prev, handle, next) {
        const a_dims = prev.getDims(false);
        const b_dims = next.getDims(false);
        const pos = handle.axis === 0 ? event.y : event.x;
        const a_start = handle.axis === 0 ? a_dims.top : a_dims.left;
        const b_end = handle.axis === 0 ? b_dims.bottom : b_dims.right;

        let a = pos - handle.pad_px / 2;
        let b = pos + handle.pad_px / 2;

        if (a - a_start < prev.min_size) {
            a = a_start + prev.min_size;
            b = a + handle.pad_px;
        }

        if (b_end - b < next.min_size) {
            b = b_end - next.min_size;
            a = b - handle.pad_px;
        }

        prev.elem.style.flexBasis = a - a_start + 'px';
        next.elem.style.flexBasis = b_end - b + 'px';
    }

    onResize() {
        /** Processes this instance's element's resize events.
         * This function is a mess at the moment. Probably some way to simplify
         * the logic.
         */
        const curr_dims = this.elem.getBoundingClientRect();
        const d_w = curr_dims.width - this.prev_dims.width;
        const d_h = curr_dims.height - this.prev_dims.height;

        // If no change to size, don't proceed.
        if (d_w === 0 && d_h === 0) {
            return;
        }

        const rows = Array.from(this.elem.querySelectorAll('.resize-handle-row'));

        if (d_w < 0) {
            // Width decrease
            for (const row of this.grid.rows.slice().reverse()) {
                row.shrink({px: Math.abs(d_w), axis: 1});
            }
        } else {
            // width increase
            for (const row of this.grid.rows.slice().reverse()) {
                row.grow({px: Math.abs(d_w), axis: 1, only_if_flex: true});
            }
        }

        if (d_h < 0) {
            // height decrease
            // shrink non-flexGrow rows first
            for (const row of rows.slice().reverse()) {
                if (!row.is_flex_grow) {
                    row.shrink({px: Math.abs(d_w), axis: 0});
                }
            }
            // Now process flexGrow rows
            for (const row of rows.slice().reverse()) {
                if (row.is_flex_grow) {
                    row.shrink({px: Math.abs(d_w), axis: 0});
                }
            }
        } else {
            // height increase
            for (const row of this.grid.rows.slice().reverse()) {
                row.grow({px: Math.abs(d_h), axis: 0, only_if_flex: true});
            }
        }

        this.prev_dims = curr_dims;
    }

    show({row_idx, col_idx} = {}) {
        this.grid.show({row_idx: row_idx, col_idx: col_idx});
        this.grid.updateVisibleHandles();
    }

    hide({row_idx, col_idx} = {}) {
        this.grid.hide({row_idx: row_idx, col_idx: col_idx});
        this.grid.updateVisibleHandles();
    }
}

const resize_handle_containers = [];
function setupAllResizeHandles() {
    gradioApp().querySelectorAll(".resize-handle-container").forEach((elem) => {
        if (!elem.querySelector(".resize-handle")) {
            const container = new ResizeHandleContainer(elem);
            container.setup();
            resize_handle_containers.push(container);
        }
    });
}

function destroyAllResizeHandles() {
    resize_handle_containers.forEach((container) => {
        container.destroy();
    });
}

onUiLoaded(setupAllResizeHandles);
