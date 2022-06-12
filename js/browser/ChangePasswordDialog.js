/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
License MIT. See README.md at the root of this distribution for full copyright
and license information*/
/* eslint-env browser, jquery */

define("browser/ChangePasswordDialog", ["browser/Dialog"], (Dialog) => {

	class ChangePasswordDialog extends Dialog {

		constructor(options) {
			options.done = (data) => {
				// Not an error, a statement
				$("#alertDialog")
				.text($.i18n.apply(null, data))
				.dialog({ modal: true });
			};

			super("ChangePasswordDialog", $.extend({
				title: $.i18n("Change password")
			}, options));
		}

		createDialog() {
			const $las = this.$dlg.find(".logged-in-as");
			if ($las.length > 0) {
				$.get("/session")
				.then(user => $las.text(
					$.i18n("um-logged-in-as", user.name)));
			}
			return super.createDialog();
		}
	}
	
	return ChangePasswordDialog;
});