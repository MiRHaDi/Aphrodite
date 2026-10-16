# One subscription URL, negotiated client profiles

The account's subscription URL stays unchanged. `clientProfile(request)` selects a format from the client's User-Agent and `renderClientSubscription` produces the response. User-Agent is not an authentication mechanism; the existing private-entry/account authorization remains in force. Edge cache keys include both client family and output format, and response headers declare `Vary: User-Agent, Accept`.

| Client family | Automatic output |
| --- | --- |
| Happ | URI subscription and Happ routing header |
| Hiddify / HiddifyNext / HiddifyNextX | sing-box JSON |
| v2rayN >= 6.40 | Full Xray JSON |
| v2rayNG >= 1.8.29 | Full Xray JSON |
| Older or unidentified v2rayN/v2rayNG | Base64 URI subscription |
| Clash / Mihomo / Clash Verge / FlClash / Clash Party | Clash-compatible YAML |
| Stash | Clash-compatible YAML without Mihomo-only tuning |
| SFA/SFI/SFM/SFT / sing-box / Karing | sing-box JSON |
| Surge | Surge INI, using only supported configured protocols |
| Shadowrocket / v2RayTun / unknown clients | Base64 URI subscription |

An explicit `format=base64|raw|clash|clash-meta|sing-box|xray|v2ray-json|surge` is available when a client hides or overrides its User-Agent. Normal imports require no app-specific URL. Apps using identical or generic User-Agents cannot be distinguished reliably; this is not a universal client negotiation standard.

Clash and sing-box outputs get automatic selection and manual selection groups. Smart-labelled transports are preferred for automatic testing; otherwise non-Iran exits are preferred. Health tests use a five-minute interval and 50 ms tolerance to limit churn and probe overhead. Existing per-node credentials, transports, explicit DNS and per-destination rules are preserved; the catch-all selects the new automatic/manual group. `.ir` uses a direct route only when the subscription request comes from Iran; outside Iran, an Iran group is created only if an actual Iran exit exists. Other Iranian domains continue to depend on provider rules. Geography is inferred at subscription refresh, not continuously from the device.

Mihomo automatic geodata updates are enabled only when the provider already supplies `geox-url`; no external dataset URLs are injected. No JavaScript, MITM certificate or executable download is introduced. Xray payloads retain the provider's full configuration rather than guessing client-specific GUI settings or core-version-dependent balancing features.

Surge accepts the configured VMess TCP/WS, Trojan TCP and selected Shadowsocks AEAD nodes. Unsupported VLESS, gRPC, XHTTP, REALITY, plugin and flow settings are excluded, never downgraded. If no compatible node exists, the renderer refuses to generate a fake configuration. Native accounts currently expose VLESS only, so native Surge output is not available; legacy accounts with compatible backend inbounds can use Surge.

Validation: unit fixtures cover client/version detection, manual overrides, credential preservation, routing references, Iran rules, native sing-box output and Surge filtering. A mocked full subscription pipeline verifies different formats and isolated cache entries at the exact same URL. Actual application imports and ISP throughput remain to be tested. These are conservative compatibility defaults, not a claim of universally fastest settings.

## فارسی

یک لینک ثابت، براساس User-Agent برنامه، قالب مخصوص آن را می‌دهد. کش هر خانواده و قالب جداست. گروه خودکار، انتخاب دستی و قواعد `.ir` با حفظ رمزها و تنظیمات اتصال ساخته می‌شوند. تنظیمات DNS موجود حفظ می‌شود؛ قابلیت ناسازگار یا دانلود و اجرای اسکریپت اضافه نمی‌شود.

تشخیص برنامه با User-Agent قطعی نیست. برای برنامه‌ای که نام خود را نمی‌فرستد، انتخاب صریح `format` راه جایگزین است. تنظیمات مدیریتی برنامه مثل فعال‌کردن TUN و مجوزهای سیستم‌عامل با سابسکریپشن به اجبار تغییر نمی‌کنند. Surge فقط کانفیگ پروتکل‌هایی را دریافت می‌کند که هم در سرور موجودند و هم در آن برنامه پشتیبانی می‌شوند.

این تغییر در شاخه نصب‌کننده منتشر می‌شود؛ تأیید استقرار زنده و ورود واقعی برنامه‌ها مستقل از آزمون‌های محلی است.

### Connection recovery

Automatic candidate pools now include independent non-Iran backups even when smart-labelled nodes exist. Clash/Stash and Surge additionally expose an ordered fallback group; sing-box uses its URL-test group. Clash and Surge enable IPv6 without overwriting explicit Clash settings. Native subscriptions include all configured `EDGE_ENDPOINTS_JSON` tuples, keeping each address paired with its own SNI and Host. These tuples must serve the same account and transport; arbitrary Cloudflare, Railway or Render IPs are not interchangeable endpoints. Existing gateway variants remain available.

Health probes use five-minute intervals to avoid excessive traffic and battery use. Failover applies to subsequent connections; established TCP sessions cannot migrate. Raw URI subscriptions and preserved Xray configurations do not gain universal automatic failover. A failed subscription URL cannot return a redirect; recovery of that URL requires client-supported backup URLs or provider integration. No automatic provider-IP scanning, unverified endpoints, or disabled certificate verification is introduced.

References: [Hiddify subscription metadata](https://github.com/hiddify/hiddify-app/wiki/URL-Scheme), [v2rayN configuration import](https://github.com/2dust/v2rayN/wiki/Description-of-some-ui), [Mihomo groups](https://wiki.metacubex.one/en/config/proxy-groups/), [sing-box configuration](https://sing-box.sagernet.org/configuration/), [Surge VMess](https://manual.nssurge.com/policies/vmess.html), [Surge automatic testing](https://manual.nssurge.com/policy-groups/url-test.html).
