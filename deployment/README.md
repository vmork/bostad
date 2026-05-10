# Deployment

This directory is the source of truth for the VPS configuration that sits next to the app code.

It keeps the long-lived server artifacts in the repo:

- Caddy config template
- one committed deployment config file
- systemd units and timers
- sudoers fragment for app deploys
- deploy and background refetch scripts
- bootstrap and install/apply scripts

## Layout

- `bootstrap/` contains first-time machine setup scripts.
- `caddy/` contains the production Caddyfile template.
- `config.env` contains the non-secret server variables used by the templates and scripts.
- `scripts/` contains deploy, refetch, and config install helpers.
- `sudoers/` contains the minimal sudo rule needed by the app user.
- `systemd/` contains service and timer templates.

## First-Time VPS Setup

1. Clone the repo onto the VPS at `/srv/bostad/app`.
2. Run `sudo bash deployment/bootstrap/bootstrap-vps.sh`.
3. Edit `deployment/config.env` and set the VPS-specific values.
4. Run `sudo bash deployment/scripts/install-config.sh`.
5. Run the normal backend/frontend dependency install and build steps.

## Ongoing Config Updates

After changing files in this directory, apply them to the VPS again:

```bash
sudo bash deployment/scripts/install-config.sh
```

That re-renders the Caddyfile, syncs the scripts into `/srv/bostad/bin`, refreshes the systemd units, and reloads the relevant services when possible.

## Notes

- The current variables in `deployment/config.env` are operational values such as domain, paths, and service settings, so keeping them in git is fine.
- GitHub Actions SSH keys still live in GitHub Actions secrets, and the VPS GitHub deploy key still lives only on the VPS.
- If a future runtime value is actually sensitive, such as an authenticated cookie, keep that out of git and load it from the server separately instead of committing it to `deployment/config.env`.
