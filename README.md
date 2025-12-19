## starter-cli

simon's starter cli 快速创建模板 cli

## Usage

Install:

```bash
npm i -g @simon_he/starter-cli
# or
pnpm add -g @simon_he/starter-cli
```

Run:

```bash
# create under current directory
simon my-app

# create under a relative path
simon my-app ./projects

# non-interactive-ish helpers
simon my-app --template vitesse --path ./projects --no-open --no-gum

# list templates / version
simon --list-templates
simon --version

# overwrite existing directory (degit --force)
simon my-app --template vitesse --force

# choose package manager
simon my-app --template vitesse --pm npm

# do not clear screen
simon my-app --template vitesse --no-clear

# preview without cloning/installing
simon my-app --template vitesse --dry-run

# machine-readable output
simon --list-templates --json
simon --version --json
simon my-app --template vitesse --dry-run --json
```

## :coffee:

[buy me a cup of coffee](https://github.com/Simon-He95/sponsor)

## License

[MIT](./license)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.png"/>
  </a>
</p>
