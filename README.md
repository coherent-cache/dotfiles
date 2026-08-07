# dotfiles

Cross-platform shell and terminal configuration, managed with
[chezmoi](https://www.chezmoi.io). Linux and macOS.

## Install

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply coherent-cache/dotfiles
```

You are asked for a git `user.name` and `user.email` once; everything else is
derived from the hostname and the operating system.

## Contents

| Path | What |
| --- | --- |
| `~/.bashrc`, `~/.bash/` | shell setup, split into per-OS modules |
| `~/.gitconfig` | git config, delta pager, gh credential helpers |
| `~/.tmux.conf`, `~/.tmux.conf.local` | tmux, based on [gpakosz/.tmux](https://github.com/gpakosz/.tmux) |
| `~/.config/starship.toml` | two-line prompt |
| `~/.config/kitty/` | kitty, with light/dark auto themes |
| `~/.config/atuin/` | shell history, `ctrl-r` only, no sync |
| `~/.claude/`, `~/.pi/` | agent settings, merged rather than overwritten |

macOS-only GUI configuration (aerospace, alacritty, karabiner) applies only on
macOS.

## Extending

- `~/.bash/.local` is never managed — put machine-local settings there.
- `~/.bash/rc.d/*.bash` is sourced if present, for drop-in additions.
- `~/.gitconfig.local` is included if present, for per-machine git settings.

## External tools

`chezmoi apply` fetches two tools it depends on:

- [zs](https://github.com/coherent-cache/zs) — session and host picker
- [zmx](https://github.com/neurosnap/zmx) — terminal multiplexer, pinned release
