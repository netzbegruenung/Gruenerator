import os

# Vor jedem Import von browser_use: keine Telemetrie, kein Cloud-Sync.
os.environ["ANONYMIZED_TELEMETRY"] = "false"
os.environ["BROWSER_USE_CLOUD_SYNC"] = "false"
