# License Guide

Univer Pro requires a license for full access. Without a license, features run in evaluation mode with limitations.

## Evaluation Mode Limits

- Watermark on documents
- Import file size limits
- Collaboration user quotas
- Some advanced features restricted

## Obtaining a License

1. Visit the Univer License page and sign in
2. Download `license-univer.zip`
3. Extract to get `license.txt` and `licenseKey.txt` — **do not edit these files**

### Free Trial

You can request a 30-day trial license from the same license page.

## Client-Side License

Register `UniverLicensePlugin` **immediately after** creating the Univer instance:

```ts
import { UniverLicensePlugin } from '@univerjs-pro/license';

const univer = new Univer({
  theme: defaultTheme,
  locale: LocaleType.ZH_CN,
});

univer.registerPlugin(UniverLicensePlugin, {
  license: process.env.CLIENT_LICENSE_TEXT,
  // or inline string:
  // license: '-----BEGIN LICENSE-----\n...\n-----END LICENSE-----',
});
```

### Worker License

The worker also needs the license for feature entitlement:

```ts
import { UniverLicensePlugin, WORKER_INIT_LICENSE } from '@univerjs-pro/license';

univer.registerPlugin(UniverLicensePlugin, {
  license: WORKER_INIT_LICENSE, // reads from global if set before worker init
});
```

Or pass the same license string used on the main thread.

## Server-Side License

Copy `license.txt` and `licenseKey.txt` into the server configs directory:

```bash
# For docker/universer deployment
cp license.txt licenseKey.txt /univer-server/configs/
bash run.sh restart
```

For Helm deployments, mount the license files as secrets or config maps.

## License Verification

### Frontend

- Missing or invalid license → watermark visible, features limited
- Valid license → limits removed

### Server

Visit the license endpoint to inspect entitlements:

```
http://localhost:8000/universer-api/license/key
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Verification failed | Check license validity, file integrity, and server restart |
| Watermark still present | Verify client-side license injection in both main thread and worker |
| Features limited after license applied | Ensure all `@univerjs-pro/*` packages are the same version |
| Worker license error | Pass license to `UniverLicensePlugin` in the worker setup |

## License Configuration Schema

```ts
interface IUniverLicenseInputConfig {
  license?: string; // Full license text string
}
```

No other options are required. The plugin handles validation and entitlement checking internally.
