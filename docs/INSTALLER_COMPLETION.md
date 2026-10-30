# Installer completion and links

The installer exits after successful verification by default. It prints the management URL, connection URLs and administrator token without starting a local web server. The former copy-token page kept the process alive; it is now opt-in with `--result-page`, which explicitly waits up to ten minutes.

URLs are printed on their own lines and use terminal hyperlinks when stdout is a terminal. `NO_COLOR` disables colors without disabling hyperlink sequences. Hyperlinks require terminal support (for example Ctrl+click in Windows Terminal); classic console hosts may require copying the full URL into a browser. Terminal output cannot force an unsupported host to make links clickable.

Resume now asks whether to configure a custom hostname if the saved installation has none. Explicit `--domain HOST` can resolve its zone from accessible Cloudflare zones without requiring a second hostname prompt. Existing choices and administrator credentials are retained. If no domain is selected, the installer explicitly reports that provider addresses will be used. This does not modify a running installation until a real provider deployment is requested.

Validation: all 144 tests, TypeScript and baseline integration passed; final completion/domain/English-output regression checks also passed (13 tests). The default result renderer was run in a separate child process with a five-second timeout to verify that it terminates without a local listener. No live deployment or DNS mutation was performed.

## فارسی

پس از پایان موفق نصب، برنامه به‌صورت پیش‌فرض خارج می‌شود. صفحهٔ محلی کپی رمز فقط با گزینهٔ `--result-page` فعال می‌شود. لینک‌ها در خط مستقل چاپ می‌شوند؛ کلیک‌پذیری به ترمینال بستگی دارد و در Windows Terminal معمولاً با Ctrl+کلیک باز می‌شوند.

اگر نصب ذخیره‌شده دامنه ندارد، هنگام ادامه امکان انتخاب دامنه ارائه می‌شود. اطلاعات کاربران و اعتبارنامه‌های ذخیره‌شده برای این اصلاح تغییر نکرده‌اند.
