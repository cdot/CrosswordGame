/*Copyright (C) 2019-2022 Crawford Currie https://c-dot.co.uk. License MIT.*/
/* eslint-env browser */

define("browser/Dialog", () => {

	/**
	 * Base class of modal dialogs. These are dialogs that support
	 * a set of fields and a submit button.
	 * In the HTML, any input or select that has a "name" attribute will
	 * be used to populate a structure that is posted to the server.
	 * The URL posted to is '/action' where 'action' is the result of
	 * a call to getAction on the Dialog.
	 */
	class Dialog {

		/**
		 * Construct the named dialog, demand-loading the HTML as
		 * necessary.
		 * @param {string} dlg the dialog name
		 * @param {object} options options
		 * @param {string} options.postAction AJAX call name
		 * @param {function} options.postResult passed result
		 * of postAction AJAX call
		 * @param {function} options.error error function, passed jqXHR
		 * 
		 */
		constructor(id, options) {
			/**
			 * Cache of settings
			 * @member {object}
			 */
			this.options = options;

			/**
			 * Cache of dialog object
			 * @member {jQuery}
			 */
			this.$dlg = $(`#${id}`);

			if (this.$dlg.length === 0) {
				// Demand-load the HTML
				$.get(`/html/${id}.html`)
				.then(html_code => {
					const $div = $(`<div id="${id}" class="dialog"></div>`)
						  .html(html_code);
					$("body").append($div);
					this.$dlg = $(`#${id}`);
					this.$dlg.dialog({
						title: options.title,
						minWidth: 400,
						width: 'auto',
						modal: true,
						open: () => this.openDialog(),
						create: () => this.createDialog()
					});
				});
			} else {
				this.$dlg.dialog({
					title: options.title,
					minWidth: 400,
					modal: true,
					open: () => this.openDialog(),
					create: () => this.createDialog()
				});
			}
		}

		/**
		 * Handle dialog creation once the HTML has been loaded.
		 * Override in subclasses to attach handlers etc.
		 * @return {Promise} promise that will be resolved when
		 * it is OK to populate the dialog. super.createDialog()
		 * must be called as the LAST step in any subclass createDialog
		 * so that selectmenus get correctly initialised.
		 */
		createDialog() {
			this.$dlg
			.find("[data-i18n]")
			.i18n();

			this.$dlg
			.find("input[data-i18n-placeholder]")
			.each(function() {
				$(this).attr("placeholder", $.i18n(
					$(this).data("i18n-placeholder")));
			});

			this.$dlg
			.tooltip({
				items: '[data-i18n-tooltip]',
				position: {
					my: "left+15 center",
					at: "right center"
				},
				content: function() {
					return $.i18n($(this).data('i18n-tooltip'));
				}
			});

			this.$dlg
			.find("label[data-image]")
			.each(function() {
				$(this).css("background-image",
							`url("${$(this).data('image')}")`);
			});

			// Using tooltips with a selectmenu is horrible. Applying
			// tooltip() to the select is useless, you have to apply it to
			// the span that covers the select. However this span is not
			// created until some indeterminate time in the future, and
			// there is no event triggered. The alternative is to create
			// the selectmenu now, but doing so blows away the browser's
			// memory of previous selections, which we want. So instead we
			// have to brute-force initialise the 'title' attribute from
			// the 'data-i18n-tooltip' attribute. Later, when the
			// selectmenus have (hopefully!) been created, map them to
			// jquery tooltips.
			this.$dlg.find('select[data-i18n-tooltip]').each(function() {
				$(this).attr('title', $.i18n($(this).data('i18n-tooltip')));
			});
			setTimeout(() => this.$dlg
					   .find('.ui-selectmenu-button')
					   .tooltip(),
					   100);

			// hide or show a password
			this.$dlg.find('.hide-password')
			.button({
				icon: "icon-eye-open"
			})
			.on("click", function() {
				const $icon = $(this);
				const $field = $icon.prev("input");
				if ($field.attr("type") === "password") {
					$field.attr("type", "text");
					$icon.button("option", "icon", "icon-eye-closed");
				} else {
					$field.attr("type", "password");
					$icon.button("option", "icon", "icon-eye-open");
				}
				// focus and move cursor to the end of input field
				var len = $field.val().length * 2;
				$field[0].setSelectionRange(len, len);
			});

			this.$dlg.find(".is-password")
			.on("keyup", evt => {
				if (evt.keyCode === 13)
					this.submit();
			});

			this.$dlg.find(".submit")
			.on("click", () => this.submit());

			this.enableSubmit();

			this.$dlg.find("select")
			.selectmenu()
			.on("selectmenuchange", () => this.enableSubmit());

			this.created = true;
			if (this.onCreation)
				this.onCreation();
		}

		/**
		 * Subclass to set any dynamic values from context.
		 * Superclass must be called.
		 * @return {Promise} promise that will be resolved when
		 * it is OK to populate the dialog.
		 */
		openDialog() {
			if (this.created)
				return Promise.resolve();
			return new Promise(resolve => this.onCreation = resolve);
		}

		/**
		 * Validate fields to determine if submit can be enabled.
		 * Override in subclasses.
		 */
		canSubmit() {
			return true;
		}

		/**
		 * Enable submit if field values allow it.
		 * @protected
		 */
		enableSubmit() {
			this.$dlg.find(".submit").prop(
				"disabled", !this.canSubmit());
		}

		/**
		 * Handle submit button
		 * @param {object} p optional hash of param values, so subclasses
		 * can handle non-input type data.
		 * @private
		 */
		submit(p) {
			this.$dlg.dialog("close");

			if (!p)
				p = {};
			this.$dlg
			.find("input[name],select[name],textarea[name]")
			.each(function() {
				let name = $(this).attr("name");
				let value;
				if (this.type === "checkbox")
					value = $(this).is(":checked") ? true : false;
				else if (this.type === "radio") {
					if (!$(this).is(":checked"))
						return;
					// Radio buttons are grouped by name, so use id
					name = this.id;
					value = true;
				} else if (this.type === "number") {
					value = parseInt($(this).val());
					if (isNaN(value))
						return;
				} else // text, password, email, <select, <textarea
					value = $(this).val() || $(this).text();
				//console.debug(name,"=",value);
				// Collect <input with the same name, and make arrays
				if (typeof p[name] === "undefined")
					p[name] = value;
				else if (typeof p[name] === "string")
					p[name] = [ p[name], value ];
				else
					p[name].push(value);
			});

			if (typeof this.onSubmit === "function")
				this.onSubmit(p);
		}

		/**
		 * Default onSubmit. Where `this.options.postAction` is defined,
		 * make an AJAX call passing the parameters. Override in
		 * subclasses for alternative behaviours. Default is no `postAction`
		 * so this is a NOP.
		 */
		onSubmit(p) {
			if (!this.options.postAction)
				return;

			// Note that password fields are sent as plain text. This is
			// not a problem so long as the comms are protected by HTTPS,
			// and is simpler/cleaner than using BasicAuth.
			// Some day we may implement OpenAuth, but there's no hurry.
			$.ajax({
				url: this.options.postAction,
				type: "POST",
				contentType: "application/json",
				data: JSON.stringify(p)
			})
			.then(data => {
				if (typeof this.options.postResult === "function")
					this.options.postResult(data);
			})
			.catch((jqXHR, textStatus, errorThrown) => {
				if (typeof this.options.error === "function")
					this.options.error(jqXHR);
				else
					console.error(jqXHR.responseText);
			});
		}

		/**
		 * Open the named dialog, demand-loading the JS and HTML as
		 * needed. Some day we may demand-load css as well, but there's
		 * no need right now. Parameters as for constructor.
		 * @return {Promise} resolving to the Dialog object
		 */
		static open(dlg, options) {
			console.log(`Opening dialog ${dlg}`);
			return new Promise(resolve => {
				requirejs([`browser/${dlg}`], Clas => {
					resolve(new Clas(options));
				});
			});
		}
	}

    return Dialog;
});
