# Dotfiles (chezmoi)

This repo manages dotfiles with chezmoi. Secrets are kept on the host.

## Bootstrap (local)

Install chezmoi and apply:

```sh
sh -c "$(curl -fsLS https://chezmoi.io/get)" -- -b ~/.local/bin
~/.local/bin/chezmoi init --apply coherent-cache/dotfiles
```

If chezmoi is already installed:

```sh
chezmoi init --apply coherent-cache/dotfiles
```

## Bootstrap (remote over SSH)

`chezmoi ssh` currently fails on macOS with:

```
sh: 0: -c requires an argument
```

Workaround (manual SSH bootstrap):

```sh
ssh marvin "sh -c 'set -e; if ! command -v chezmoi >/dev/null 2>&1; then mkdir -p ~/.local/bin; curl -fsLS https://chezmoi.io/get | sh -s -- -b ~/.local/bin; fi; ~/.local/bin/chezmoi init --apply coherent-cache/dotfiles'"
```

## Secrets (not in repo)

Restore these on each host as needed:

- `~/.ssh/id_*`
- `~/.ssh/known_hosts*`
- `~/.gitcookies`
- `~/.vpn`
- `~/.docker`

## Updating

```sh
chezmoi update
```
