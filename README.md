# Dotfiles

This repo manages dotfiles with chezmoi. Secrets stay on the host and are not
tracked here.

## Bootstrap (new machine)

SSH into the new machine, then run:

```sh
mkdir -p ~/.local/bin
curl -fsLS https://chezmoi.io/get | sh -s -- -b ~/.local/bin

chezmoi init --apply coherent-cache
```

## Notes

- OS-specific bash settings live in `~/.bash/.macos`, `~/.bash/.linux`,
  `~/.bash/.wsl`.
- `~/.tmux.conf` is a minimal base, with customizations in
  `~/.tmux.conf.local`.
- Update/apply changes with `chezmoi update`.
