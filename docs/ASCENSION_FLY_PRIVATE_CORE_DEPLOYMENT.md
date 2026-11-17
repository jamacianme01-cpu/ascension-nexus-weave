# ASCENSION existing engines on Fly (private runtime boundary)

The existing ASCENSION web repository is public. **Do not commit any
`ASCENSION_CORE`, CLARITY engine source, private records, secrets, or state here.**

The V1 application and its governed engines run as `web` and `worker` process
groups in the **same Fly app**, `ascension-nexus-weave`. The `worker` process
uses the **existing** `ASCENSION_CORE.cloud_queue_worker` and the existing
guest-authorized `/api/public/ascension/execution-queue` endpoint. This is
not an alternative AI engine or a new computer.

The engine source must come from the owner's **current private** repository.
The previous archives saved in the ChatGPT Library are historical snapshots,
not verified current engine source. This deployment never silently substitutes
one of them.

Private checkout required at build time (not committed to this public repo):

```
.private_runtime/
  ASCENSION_CORE/
    __init__.py
    cloud_queue_worker.py
    objective_runtime.py
    ...
  clarity/
    __init__.py
    core_runtime.py
    ...
```

The deploy workflow checks out the existing private repository
`jamacianme01-cpu/ascensionweave` into `.private_runtime`. That repository
must hold the **current** working packages under the exact paths above.
Checkout requires a read-only `ASCENSION_CORE_READ_TOKEN` GitHub Actions
secret with access only to the private repository. The normal public GitHub
token cannot read that private repository.

The existing `FLY_API_TOKEN` GitHub Actions secret authorizes deployment.
The runtime worker additionally requires the `ASCENSION_PUBLISH_TOKEN` as
a **Fly app secret** matching the secured queue endpoint. Neither token belongs
in a source file or a `fly.toml` environment variable.

The original core uses durable on-disk intake, journals, Knowledgeverse,
ledger, and governed publication state. Before the first dual-process Fly
deployment, provision a persistent Fly volume named `ascension_state`
in the app's chosen region and attach it to the `worker` process group at
`/data/ascension`. Preserve this volume during subsequent deployments.
Fly volumes are per-Machine; never scale the stateful worker to multiple
Machines without a data-coordination design and owner approval.

The existing deploy workflow refuses to deploy when the private current core
is missing, incomplete, or syntactically invalid. It does not expose the engine
source in the public GitHub repository. The running Fly image may contain
private code, so protect access to its registry, machines, and logs.

The worker claims **every queued objective** through the existing queue
without restricting domains or replacing ASCENSION's engines with fixed
examples or paid answer providers. Whether the selected core version
actually produces the required complete three pathways plus BLEND,
pathway-specific picture, and spoken Tree explanation still requires a
real post-deployment end-to-end test. A successful build does not mean
the owner has approved checklist items 2–7.

Do not merge the deployment PR or claim live completion until the owner
has confirmed the private core source and the Fly runtime is verified.
