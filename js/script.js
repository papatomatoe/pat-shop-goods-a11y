"use strict";

// Save a list of named combobox actions, for future readability
const SelectActions = {
	Close: 0,
	CloseSelect: 1,
	First: 2,
	Last: 3,
	Next: 4,
	Open: 5,
	PageDown: 6,
	PageUp: 7,
	Previous: 8,
	Select: 9,
	Type: 10,
};

/*
 * Helper functions
 */

// filter an array of options against an input string
// returns an array of options that begin with the filter string, case-independent
function filterOptions(options = [], filter, exclude = []) {
	return options.filter((option) => {
		const matches =
			option.title.toLowerCase().indexOf(filter.toLowerCase()) === 0;
		return matches && exclude.indexOf(option) < 0;
	});
}

// map a key press to an action
function getActionFromKey(event, menuOpen) {
	const { key, altKey, ctrlKey, metaKey } = event;
	const openKeys = ["ArrowDown", "ArrowUp", "Enter", " "]; // all keys that will do the default open action
	// handle opening when closed
	if (!menuOpen && openKeys.includes(key)) {
		return SelectActions.Open;
	}

	// home and end move the selected option when open or closed
	if (key === "Home") {
		return SelectActions.First;
	}
	if (key === "End") {
		return SelectActions.Last;
	}

	// handle typing characters when open or closed
	if (
		key === "Backspace" ||
		key === "Clear" ||
		(key.length === 1 && key !== " " && !altKey && !ctrlKey && !metaKey)
	) {
		return SelectActions.Type;
	}

	// handle keys when open
	if (menuOpen) {
		if (key === "ArrowUp" && altKey) {
			return SelectActions.CloseSelect;
		} else if (key === "ArrowDown" && !altKey) {
			return SelectActions.Next;
		} else if (key === "ArrowUp") {
			return SelectActions.Previous;
		} else if (key === "PageUp") {
			return SelectActions.PageUp;
		} else if (key === "PageDown") {
			return SelectActions.PageDown;
		} else if (key === "Escape") {
			return SelectActions.Close;
		} else if (key === "Enter" || key === " ") {
			return SelectActions.CloseSelect;
		}
	}
}

// return the index of an option from an array of options, based on a search string
// if the filter is multiple iterations of the same letter (e.g "aaa"), then cycle through first-letter matches
function getIndexByLetter(options, filter, startIndex = 0) {
	const orderedOptions = [
		...options.slice(startIndex),
		...options.slice(0, startIndex),
	];
	const firstMatch = filterOptions(orderedOptions, filter)[0];
	const allSameLetter = (array) => array.every((letter) => letter === array[0]);

	// first check if there is an exact match for the typed string
	if (firstMatch) {
		return options.indexOf(firstMatch);
	}

	// if the same letter is being repeated, cycle through first-letter matches
	else if (allSameLetter(filter.split(""))) {
		const matches = filterOptions(orderedOptions, filter[0]);
		return options.indexOf(matches[0]);
	}

	// if no matches, return -1
	else {
		return -1;
	}
}

// get an updated option index after performing an action
function getUpdatedIndex(currentIndex, maxIndex, action) {
	const pageSize = 10; // used for pageup/pagedown

	switch (action) {
		case SelectActions.First:
			return 0;
		case SelectActions.Last:
			return maxIndex;
		case SelectActions.Previous:
			return Math.max(0, currentIndex - 1);
		case SelectActions.Next:
			return Math.min(maxIndex, currentIndex + 1);
		case SelectActions.PageUp:
			return Math.max(0, currentIndex - pageSize);
		case SelectActions.PageDown:
			return Math.min(maxIndex, currentIndex + pageSize);
		default:
			return currentIndex;
	}
}

// check if element is visible in browser view port
function isElementInView(element) {
	var bounding = element.getBoundingClientRect();

	return (
		bounding.top >= 0 &&
		bounding.left >= 0 &&
		bounding.bottom <=
			(window.innerHeight || document.documentElement.clientHeight) &&
		bounding.right <=
			(window.innerWidth || document.documentElement.clientWidth)
	);
}

// check if an element is currently scrollable
function isScrollable(element) {
	return element && element.clientHeight < element.scrollHeight;
}

// ensure a given child element is within the parent's visible scroll area
// if the child is not visible, scroll the parent
function maintainScrollVisibility(activeElement, scrollParent) {
	const { offsetHeight, offsetTop } = activeElement;
	const { offsetHeight: parentOffsetHeight, scrollTop } = scrollParent;

	const isAbove = offsetTop < scrollTop;
	const isBelow = offsetTop + offsetHeight > scrollTop + parentOffsetHeight;

	if (isAbove) {
		scrollParent.scrollTo(0, offsetTop);
	} else if (isBelow) {
		scrollParent.scrollTo(0, offsetTop - parentOffsetHeight + offsetHeight);
	}
}

/*
 * Select Component
 * Accepts a combobox element and an array of string options
 */
const Select = function (el, options = []) {
	// element refs
	this.el = el;
	this.comboEl = el.querySelector("[role=combobox]");
	this.listboxEl = el.querySelector("[role=listbox]");

	// items refs
	this.itemList = document.querySelector(".goods__list");
	this.items = this.itemList.querySelectorAll(".goods__item");

	// data
	this.idBase = this.comboEl.id || "combo";
	this.options = options;

	// state
	this.activeIndex = 0;
	this.open = false;
	this.searchString = "";
	this.searchTimeout = null;

	// init
	if (el && this.comboEl && this.listboxEl) {
		this.init();
	}
};

Select.prototype.init = function () {
	// select first option by default
	this.comboEl.innerHTML = this.options[0].title;

	// add event listeners
	this.comboEl.addEventListener("blur", this.onComboBlur.bind(this));
	this.comboEl.addEventListener("click", this.onComboClick.bind(this));
	this.comboEl.addEventListener("keydown", this.onComboKeyDown.bind(this));

	// create options
	this.options.map((option, index) => {
		const optionEl = this.createOption(option.title, index);
		this.listboxEl.appendChild(optionEl);
	});
};

Select.prototype.createOption = function (optionText, index) {
	const optionEl = document.createElement("div");
	optionEl.setAttribute("role", "option");
	optionEl.id = `${this.idBase}-${index}`;
	optionEl.className =
		index === 0 ? "combo-option option-current" : "combo-option";
	optionEl.setAttribute("aria-selected", `${index === 0}`);
	optionEl.innerText = optionText;

	optionEl.addEventListener("click", (event) => {
		event.stopPropagation();
		this.onOptionClick(index);
	});
	optionEl.addEventListener("mousedown", this.onOptionMouseDown.bind(this));

	return optionEl;
};

Select.prototype.getSearchString = function (char) {
	// reset typing timeout and start new timeout
	// this allows us to make multiple-letter matches, like a native select
	if (typeof this.searchTimeout === "number") {
		window.clearTimeout(this.searchTimeout);
	}

	this.searchTimeout = window.setTimeout(() => {
		this.searchString = "";
	}, 500);

	// add most recent letter to saved search string
	this.searchString += char;
	return this.searchString;
};

Select.prototype.onComboBlur = function () {
	// do not do blur action if ignoreBlur flag has been set
	if (this.ignoreBlur) {
		this.ignoreBlur = false;
		return;
	}

	// select current option and close
	if (this.open) {
		this.selectOption(this.activeIndex);
		this.updateMenuState(false, false);
	}
};

Select.prototype.onComboClick = function () {
	this.updateMenuState(!this.open, false);
};

Select.prototype.onComboKeyDown = function (event) {
	const { key } = event;
	const max = this.options.length - 1;

	const action = getActionFromKey(event, this.open);

	switch (action) {
		case SelectActions.Last:
		case SelectActions.First:
			this.updateMenuState(true);
		// intentional fallthrough
		case SelectActions.Next:
		case SelectActions.Previous:
		case SelectActions.PageUp:
		case SelectActions.PageDown:
			event.preventDefault();
			return this.onOptionChange(
				getUpdatedIndex(this.activeIndex, max, action)
			);
		case SelectActions.CloseSelect:
			event.preventDefault();
			this.selectOption(this.activeIndex);
		// intentional fallthrough
		case SelectActions.Close:
			event.preventDefault();
			return this.updateMenuState(false);
		case SelectActions.Type:
			return this.onComboType(key);
		case SelectActions.Open:
			event.preventDefault();
			return this.updateMenuState(true);
	}
};

Select.prototype.onComboType = function (letter) {
	// open the listbox if it is closed
	this.updateMenuState(true);

	// find the index of the first matching option
	const searchString = this.getSearchString(letter);
	const searchIndex = getIndexByLetter(
		this.options,
		searchString,
		this.activeIndex + 1
	);

	// if a match was found, go to it
	if (searchIndex >= 0) {
		this.onOptionChange(searchIndex);
	}
	// if no matches, clear the timeout and search string
	else {
		window.clearTimeout(this.searchTimeout);
		this.searchString = "";
	}
};

Select.prototype.onOptionChange = function (index) {
	// update state
	this.activeIndex = index;

	// update aria-activedescendant
	this.comboEl.setAttribute("aria-activedescendant", `${this.idBase}-${index}`);

	// update active option styles
	const options = this.el.querySelectorAll("[role=option]");
	[...options].forEach((optionEl) => {
		optionEl.classList.remove("option-current");
	});
	options[index].classList.add("option-current");

	// ensure the new option is in view
	if (isScrollable(this.listboxEl)) {
		maintainScrollVisibility(options[index], this.listboxEl);
	}

	// ensure the new option is visible on screen
	// ensure the new option is in view
	if (!isElementInView(options[index])) {
		options[index].scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
};

Select.prototype.onOptionClick = function (index) {
	this.onOptionChange(index);
	this.selectOption(index);
	this.updateMenuState(false);
};

Select.prototype.onOptionMouseDown = function () {
	// Clicking an option will cause a blur event,
	// but we don't want to perform the default keyboard blur action
	this.ignoreBlur = true;
};

Select.prototype.selectOption = function (index) {
	// update state
	this.activeIndex = index;

	// update displayed value
	const selected = this.options[index];
	this.comboEl.innerHTML = selected.title;

	// update aria-selected
	const options = this.el.querySelectorAll("[role=option]");
	[...options].forEach((optionEl) => {
		optionEl.setAttribute("aria-selected", "false");
	});
	options[index].setAttribute("aria-selected", "true");

	const activeOptionValue = this.options[this.activeIndex].value;

	const sortedItems = [...this.items].sort((a, b) => {
		const A = a.querySelector(".js-price") ?? a.querySelector(".goods__price");
		const priceA = Number(A.innerText.split("$")[0]);
		const B = b.querySelector(".js-price") ?? b.querySelector(".goods__price");
		const priceB = Number(B.innerText.split("$")[0]);

		return activeOptionValue
			? activeOptionValue === "increase"
				? priceA - priceB
				: priceB - priceA
			: 0;
	});

	[...this.itemList.children].forEach((el) => this.itemList.removeChild(el));
	sortedItems.forEach((el) => this.itemList.append(el));
};

Select.prototype.updateMenuState = function (open, callFocus = true) {
	if (this.open === open) {
		return;
	}

	// update state
	this.open = open;

	// update aria-expanded and styles
	this.comboEl.setAttribute("aria-expanded", `${open}`);
	open ? this.el.classList.add("open") : this.el.classList.remove("open");

	// update activedescendant
	const activeID = open ? `${this.idBase}-${this.activeIndex}` : "";
	this.comboEl.setAttribute("aria-activedescendant", activeID);

	if (activeID === "" && !isElementInView(this.comboEl)) {
		this.comboEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}

	// move focus back to the combobox, if needed
	callFocus && this.comboEl.focus();
};

// Tabs

class TabsManual {
	constructor(groupNode) {
		this.tablistNode = groupNode;

		this.tabs = [];

		this.firstTab = null;
		this.lastTab = null;

		this.tabs = Array.from(this.tablistNode.querySelectorAll("[role=tab]"));
		this.tabpanels = [];

		for (var i = 0; i < this.tabs.length; i += 1) {
			var tab = this.tabs[i];
			var tabpanel = document.getElementById(tab.getAttribute("aria-controls"));

			tab.tabIndex = -1;
			tab.setAttribute("aria-selected", "false");
			this.tabpanels.push(tabpanel);

			tab.addEventListener("keydown", this.onKeydown.bind(this));
			tab.addEventListener("click", this.onClick.bind(this));

			if (!this.firstTab) {
				this.firstTab = tab;
			}
			this.lastTab = tab;
		}

		this.setSelectedTab(this.firstTab);
	}

	setSelectedTab(currentTab) {
		for (var i = 0; i < this.tabs.length; i += 1) {
			var tab = this.tabs[i];
			if (currentTab === tab) {
				tab.setAttribute("aria-selected", "true");
				tab.removeAttribute("tabindex");
				this.tabpanels[i].classList.remove("is-hidden");
			} else {
				tab.setAttribute("aria-selected", "false");
				tab.tabIndex = -1;
				this.tabpanels[i].classList.add("is-hidden");
			}
		}
	}

	moveFocusToTab(currentTab) {
		currentTab.focus();
	}

	moveFocusToPreviousTab(currentTab) {
		var index;

		if (currentTab === this.firstTab) {
			this.moveFocusToTab(this.lastTab);
		} else {
			index = this.tabs.indexOf(currentTab);
			this.moveFocusToTab(this.tabs[index - 1]);
		}
	}

	moveFocusToNextTab(currentTab) {
		var index;

		if (currentTab === this.lastTab) {
			this.moveFocusToTab(this.firstTab);
		} else {
			index = this.tabs.indexOf(currentTab);
			this.moveFocusToTab(this.tabs[index + 1]);
		}
	}

	/* EVENT HANDLERS */

	onKeydown(event) {
		var tgt = event.currentTarget,
			flag = false;

		switch (event.key) {
			case "ArrowLeft":
				this.moveFocusToPreviousTab(tgt);
				flag = true;
				break;

			case "ArrowRight":
				this.moveFocusToNextTab(tgt);
				flag = true;
				break;

			case "Home":
				this.moveFocusToTab(this.firstTab);
				flag = true;
				break;

			case "End":
				this.moveFocusToTab(this.lastTab);
				flag = true;
				break;

			default:
				break;
		}

		if (flag) {
			event.stopPropagation();
			event.preventDefault();
		}
	}

	// Since this example uses buttons for the tabs, the click onr also is activated
	// with the space and enter keys
	onClick(event) {
		this.setSelectedTab(event.currentTarget);
	}
}

// MODAL

var aria = aria || {};

aria.Utils = aria.Utils || {};

(function () {
	/*
	 * When util functions move focus around, set this true so the focus listener
	 * can ignore the events.
	 */
	aria.Utils.IgnoreUtilFocusChanges = false;

	aria.Utils.dialogOpenClass = "has-dialog";

	/**
	 * @description Set focus on descendant nodes until the first focusable element is
	 *       found.
	 * @param element
	 *          DOM node for which to find the first focusable descendant.
	 * @returns {boolean}
	 *  true if a focusable element is found and focus is set.
	 */
	aria.Utils.focusFirstDescendant = function (element) {
		for (var i = 0; i < element.childNodes.length; i++) {
			var child = element.childNodes[i];
			if (
				aria.Utils.attemptFocus(child) ||
				aria.Utils.focusFirstDescendant(child)
			) {
				return true;
			}
		}
		return false;
	}; // end focusFirstDescendant

	/**
	 * @description Find the last descendant node that is focusable.
	 * @param element
	 *          DOM node for which to find the last focusable descendant.
	 * @returns {boolean}
	 *  true if a focusable element is found and focus is set.
	 */
	aria.Utils.focusLastDescendant = function (element) {
		for (var i = element.childNodes.length - 1; i >= 0; i--) {
			var child = element.childNodes[i];
			if (
				aria.Utils.attemptFocus(child) ||
				aria.Utils.focusLastDescendant(child)
			) {
				return true;
			}
		}
		return false;
	}; // end focusLastDescendant

	/**
	 * @description Set Attempt to set focus on the current node.
	 * @param element
	 *          The node to attempt to focus on.
	 * @returns {boolean}
	 *  true if element is focused.
	 */
	aria.Utils.attemptFocus = function (element) {
		if (!aria.Utils.isFocusable(element)) {
			return false;
		}

		aria.Utils.IgnoreUtilFocusChanges = true;
		try {
			element.focus();
		} catch (e) {
			// continue regardless of error
		}
		aria.Utils.IgnoreUtilFocusChanges = false;
		return document.activeElement === element;
	}; // end attemptFocus

	/* Modals can open modals. Keep track of them with this array. */
	aria.OpenDialogList = aria.OpenDialogList || new Array(0);

	/**
	 * @returns {object} the last opened dialog (the current dialog)
	 */
	aria.getCurrentDialog = function () {
		if (aria.OpenDialogList && aria.OpenDialogList.length) {
			return aria.OpenDialogList[aria.OpenDialogList.length - 1];
		}
	};

	aria.closeCurrentDialog = function () {
		var currentDialog = aria.getCurrentDialog();
		if (currentDialog) {
			currentDialog.close();
			return true;
		}

		return false;
	};

	aria.handleEscape = function (event) {
		var key = event.which || event.keyCode;

		if (key === aria.KeyCode.ESC && aria.closeCurrentDialog()) {
			event.stopPropagation();
		}
	};

	document.addEventListener("keyup", aria.handleEscape);

	/**
	 * @class
	 * @description Dialog object providing modal focus management.
	 *
	 * Assumptions: The element serving as the dialog container is present in the
	 * DOM and hidden. The dialog container has role='dialog'.
	 * @param dialogId
	 *          The ID of the element serving as the dialog container.
	 * @param focusAfterClosed
	 *          Either the DOM node or the ID of the DOM node to focus when the
	 *          dialog closes.
	 * @param focusFirst
	 *          Optional parameter containing either the DOM node or the ID of the
	 *          DOM node to focus when the dialog opens. If not specified, the
	 *          first focusable element in the dialog will receive focus.
	 */
	aria.Dialog = function (dialogId, focusAfterClosed, focusFirst) {
		this.dialogNode = document.getElementById(dialogId);
		if (this.dialogNode === null) {
			throw new Error('No element found with id="' + dialogId + '".');
		}

		var validRoles = ["dialog", "alertdialog"];
		var isDialog = (this.dialogNode.getAttribute("role") || "")
			.trim()
			.split(/\s+/g)
			.some(function (token) {
				return validRoles.some(function (role) {
					return token === role;
				});
			});
		if (!isDialog) {
			throw new Error(
				"Dialog() requires a DOM element with ARIA role of dialog or alertdialog."
			);
		}

		// Wrap in an individual backdrop element if one doesn't exist
		// Native <dialog> elements use the ::backdrop pseudo-element, which
		// works similarly.
		var backdropClass = "dialog-backdrop";
		if (this.dialogNode.parentNode.classList.contains(backdropClass)) {
			this.backdropNode = this.dialogNode.parentNode;
		} else {
			this.backdropNode = document.createElement("div");
			this.backdropNode.className = backdropClass;
			this.dialogNode.parentNode.insertBefore(
				this.backdropNode,
				this.dialogNode
			);
			this.backdropNode.appendChild(this.dialogNode);
		}
		this.backdropNode.classList.add("active");

		// Disable scroll on the body element
		document.body.classList.add(aria.Utils.dialogOpenClass);

		if (typeof focusAfterClosed === "string") {
			this.focusAfterClosed = document.getElementById(focusAfterClosed);
		} else if (typeof focusAfterClosed === "object") {
			this.focusAfterClosed = focusAfterClosed;
		} else {
			throw new Error(
				"the focusAfterClosed parameter is required for the aria.Dialog constructor."
			);
		}

		if (typeof focusFirst === "string") {
			this.focusFirst = document.getElementById(focusFirst);
		} else if (typeof focusFirst === "object") {
			this.focusFirst = focusFirst;
		} else {
			this.focusFirst = null;
		}

		// Bracket the dialog node with two invisible, focusable nodes.
		// While this dialog is open, we use these to make sure that focus never
		// leaves the document even if dialogNode is the first or last node.
		var preDiv = document.createElement("div");
		this.preNode = this.dialogNode.parentNode.insertBefore(
			preDiv,
			this.dialogNode
		);
		this.preNode.tabIndex = 0;
		var postDiv = document.createElement("div");
		this.postNode = this.dialogNode.parentNode.insertBefore(
			postDiv,
			this.dialogNode.nextSibling
		);
		this.postNode.tabIndex = 0;

		// If this modal is opening on top of one that is already open,
		// get rid of the document focus listener of the open dialog.
		if (aria.OpenDialogList.length > 0) {
			aria.getCurrentDialog().removeListeners();
		}

		this.addListeners();
		aria.OpenDialogList.push(this);
		this.clearDialog();
		this.dialogNode.className = "default_dialog"; // make visible

		if (this.focusFirst) {
			this.focusFirst.focus();
		} else {
			aria.Utils.focusFirstDescendant(this.dialogNode);
		}

		this.lastFocus = document.activeElement;
	}; // end Dialog constructor

	aria.Dialog.prototype.clearDialog = function () {
		Array.prototype.map.call(
			this.dialogNode.querySelectorAll("input"),
			function (input) {
				input.value = "";
			}
		);
	};

	/**
	 * @description
	 *  Hides the current top dialog,
	 *  removes listeners of the top dialog,
	 *  restore listeners of a parent dialog if one was open under the one that just closed,
	 *  and sets focus on the element specified for focusAfterClosed.
	 */
	aria.Dialog.prototype.close = function () {
		aria.OpenDialogList.pop();
		this.removeListeners();
		aria.Utils.remove(this.preNode);
		aria.Utils.remove(this.postNode);
		this.dialogNode.className = "hidden";
		this.backdropNode.classList.remove("active");
		this.focusAfterClosed.focus();

		// If a dialog was open underneath this one, restore its listeners.
		if (aria.OpenDialogList.length > 0) {
			aria.getCurrentDialog().addListeners();
		} else {
			document.body.classList.remove(aria.Utils.dialogOpenClass);
		}
	}; // end close

	/**
	 * @description
	 *  Hides the current dialog and replaces it with another.
	 * @param newDialogId
	 *  ID of the dialog that will replace the currently open top dialog.
	 * @param newFocusAfterClosed
	 *  Optional ID or DOM node specifying where to place focus when the new dialog closes.
	 *  If not specified, focus will be placed on the element specified by the dialog being replaced.
	 * @param newFocusFirst
	 *  Optional ID or DOM node specifying where to place focus in the new dialog when it opens.
	 *  If not specified, the first focusable element will receive focus.
	 */
	aria.Dialog.prototype.replace = function (
		newDialogId,
		newFocusAfterClosed,
		newFocusFirst
	) {
		aria.OpenDialogList.pop();
		this.removeListeners();
		aria.Utils.remove(this.preNode);
		aria.Utils.remove(this.postNode);
		this.dialogNode.className = "hidden";
		this.backdropNode.classList.remove("active");

		var focusAfterClosed = newFocusAfterClosed || this.focusAfterClosed;
		new aria.Dialog(newDialogId, focusAfterClosed, newFocusFirst);
	}; // end replace

	aria.Dialog.prototype.addListeners = function () {
		document.addEventListener("focus", this.trapFocus, true);
	}; // end addListeners

	aria.Dialog.prototype.removeListeners = function () {
		document.removeEventListener("focus", this.trapFocus, true);
	}; // end removeListeners

	aria.Dialog.prototype.trapFocus = function (event) {
		if (aria.Utils.IgnoreUtilFocusChanges) {
			return;
		}
		var currentDialog = aria.getCurrentDialog();
		if (currentDialog.dialogNode.contains(event.target)) {
			currentDialog.lastFocus = event.target;
		} else {
			aria.Utils.focusFirstDescendant(currentDialog.dialogNode);
			if (currentDialog.lastFocus == document.activeElement) {
				aria.Utils.focusLastDescendant(currentDialog.dialogNode);
			}
			currentDialog.lastFocus = document.activeElement;
		}
	}; // end trapFocus

	window.openDialog = function (dialogId, focusAfterClosed, focusFirst) {
		new aria.Dialog(dialogId, focusAfterClosed, focusFirst);
	};

	window.closeDialog = function (closeButton) {
		var topDialog = aria.getCurrentDialog();
		if (topDialog.dialogNode.contains(closeButton)) {
			topDialog.close();
		}
	}; // end closeDialog

	window.replaceDialog = function (
		newDialogId,
		newFocusAfterClosed,
		newFocusFirst
	) {
		var topDialog = aria.getCurrentDialog();
		if (topDialog.dialogNode.contains(document.activeElement)) {
			topDialog.replace(newDialogId, newFocusAfterClosed, newFocusFirst);
		}
	}; // end replaceDialog
})();
("use strict");

const form = document.querySelector(".dialog__form");
form.addEventListener("submit", (e) => {
	e.preventDefault();
	window.replaceDialog("dialog2", undefined, "dialog2_close_btn");
});

/**
 * @namespace aria
 */

var aria = aria || {};

/**
 * @description
 *  Key code constants
 */
aria.KeyCode = {
	BACKSPACE: 8,
	TAB: 9,
	RETURN: 13,
	SHIFT: 16,
	ESC: 27,
	SPACE: 32,
	PAGE_UP: 33,
	PAGE_DOWN: 34,
	END: 35,
	HOME: 36,
	LEFT: 37,
	UP: 38,
	RIGHT: 39,
	DOWN: 40,
	DELETE: 46,
};

aria.Utils = aria.Utils || {};

// Polyfill src https://developer.mozilla.org/en-US/docs/Web/API/Element/matches
aria.Utils.matches = function (element, selector) {
	if (!Element.prototype.matches) {
		Element.prototype.matches =
			Element.prototype.matchesSelector ||
			Element.prototype.mozMatchesSelector ||
			Element.prototype.msMatchesSelector ||
			Element.prototype.oMatchesSelector ||
			Element.prototype.webkitMatchesSelector ||
			function (s) {
				var matches = element.parentNode.querySelectorAll(s);
				var i = matches.length;
				while (--i >= 0 && matches.item(i) !== this) {
					// empty
				}
				return i > -1;
			};
	}

	return element.matches(selector);
};

aria.Utils.remove = function (item) {
	if (item.remove && typeof item.remove === "function") {
		return item.remove();
	}
	if (
		item.parentNode &&
		item.parentNode.removeChild &&
		typeof item.parentNode.removeChild === "function"
	) {
		return item.parentNode.removeChild(item);
	}
	return false;
};

aria.Utils.isFocusable = function (element) {
	if (element.tabIndex < 0) {
		return false;
	}

	if (element.disabled) {
		return false;
	}

	switch (element.nodeName) {
		case "A":
			return !!element.href && element.rel != "ignore";
		case "INPUT":
			return element.type != "hidden";
		case "BUTTON":
		case "SELECT":
		case "TEXTAREA":
			return true;
		default:
			return false;
	}
};

aria.Utils.getAncestorBySelector = function (element, selector) {
	if (!aria.Utils.matches(element, selector + " " + element.tagName)) {
		// Element is not inside an element that matches selector
		return null;
	}

	// Move up the DOM tree until a parent matching the selector is found
	var currentNode = element;
	var ancestor = null;
	while (ancestor === null) {
		if (aria.Utils.matches(currentNode.parentNode, selector)) {
			ancestor = currentNode.parentNode;
		} else {
			currentNode = currentNode.parentNode;
		}
	}

	return ancestor;
};

aria.Utils.hasClass = function (element, className) {
	return new RegExp("(\\s|^)" + className + "(\\s|$)").test(element.className);
};

aria.Utils.addClass = function (element, className) {
	if (!aria.Utils.hasClass(element, className)) {
		element.className += " " + className;
	}
};

aria.Utils.removeClass = function (element, className) {
	var classRegex = new RegExp("(\\s|^)" + className + "(\\s|$)");
	element.className = element.className.replace(classRegex, " ").trim();
};

aria.Utils.bindMethods = function (object /* , ...methodNames */) {
	var methodNames = Array.prototype.slice.call(arguments, 1);
	methodNames.forEach(function (method) {
		object[method] = object[method].bind(object);
	});
};

// RADIO

class RadioGroup {
	constructor(groupNode) {
		this.groupNode = groupNode;

		this.radioButtons = [];

		this.firstRadioButton = null;
		this.lastRadioButton = null;

		var rbs = this.groupNode.querySelectorAll("[role=radio]");

		for (var i = 0; i < rbs.length; i += 1) {
			var rb = rbs[i];

			if (i === 0) {
				rb.tabIndex = 0;
				rb.setAttribute("aria-checked", "true");
			} else {
				rb.tabIndex = -1;
				rb.setAttribute("aria-checked", "false");
			}

			rb.addEventListener("keydown", this.handleKeydown.bind(this));
			rb.addEventListener("click", this.handleClick.bind(this));
			rb.addEventListener("focus", this.handleFocus.bind(this));
			rb.addEventListener("blur", this.handleBlur.bind(this));

			this.radioButtons.push(rb);

			if (!this.firstRadioButton) {
				this.firstRadioButton = rb;
			}
			this.lastRadioButton = rb;
		}
		this.firstRadioButton.tabIndex = 0;
	}

	setChecked(currentItem) {
		for (var i = 0; i < this.radioButtons.length; i += 1) {
			var rb = this.radioButtons[i];
			rb.setAttribute("aria-checked", "false");
			rb.tabIndex = -1;
		}
		currentItem.setAttribute("aria-checked", "true");
		currentItem.tabIndex = 0;
		currentItem.focus();
	}

	setCheckedToPreviousItem(currentItem) {
		var index;

		if (currentItem === this.firstRadioButton) {
			this.setChecked(this.lastRadioButton);
		} else {
			index = this.radioButtons.indexOf(currentItem);
			this.setChecked(this.radioButtons[index - 1]);
		}
	}

	setCheckedToNextItem(currentItem) {
		var index;

		if (currentItem === this.lastRadioButton) {
			this.setChecked(this.firstRadioButton);
		} else {
			index = this.radioButtons.indexOf(currentItem);
			this.setChecked(this.radioButtons[index + 1]);
		}
	}

	/* EVENT HANDLERS */

	handleKeydown(event) {
		var tgt = event.currentTarget,
			flag = false;

		switch (event.key) {
			case " ":
			case "Enter":
				this.setChecked(tgt);
				flag = true;
				break;

			case "Up":
			case "ArrowUp":
			case "Left":
			case "ArrowLeft":
				this.setCheckedToPreviousItem(tgt);
				flag = true;
				break;

			case "Down":
			case "ArrowDown":
			case "Right":
			case "ArrowRight":
				this.setCheckedToNextItem(tgt);
				flag = true;
				break;

			default:
				break;
		}

		if (flag) {
			event.stopPropagation();
			event.preventDefault();
		}
	}

	handleClick(event) {
		this.setChecked(event.currentTarget);
	}

	handleFocus(event) {
		event.currentTarget.classList.add("focus");
	}

	handleBlur(event) {
		event.currentTarget.classList.remove("focus");
	}
}

// Initialize
window.addEventListener("load", function () {
	var radios = document.querySelectorAll('[role="radiogroup"]');
	for (var i = 0; i < radios.length; i += 1) {
		new RadioGroup(radios[i]);
	}

	const options = [
		{ title: "Нет сортировки", value: null },
		{ title: "По возрастанию цены", value: "increase" },
		{ title: "По убыванию цены", value: "decrease" },
	];
	const selectEls = document.querySelectorAll(".js-select");

	selectEls.forEach((el) => {
		new Select(el, options);
	});

	var tablists = document.querySelectorAll("[role=tablist].manual");
	for (var i = 0; i < tablists.length; i++) {
		new TabsManual(tablists[i]);
	}
});
