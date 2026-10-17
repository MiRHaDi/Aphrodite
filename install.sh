#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/aphrodite-installer"
mkdir -p "$cache_root"
if ! command -v curl >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ] && command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq curl ca-certificates; else echo 'curl is required; install it with your OS package manager.' >&2; exit 1; fi
fi
case "$(uname -s)" in Linux) platform=linux;; Darwin) platform=darwin;; *) echo 'Use install.ps1 on Windows.' >&2; exit 1;; esac
case "$(uname -m)" in x86_64) arch=x64;; aarch64|arm64) arch=arm64;; *) echo 'Unsupported architecture' >&2; exit 1;; esac
printf '[1/5] Resolve official Node version and checksums\n'
checksums="$(curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)"
filename="$(printf '%s\n' "$checksums" | awk -v suffix="-$platform-$arch.tar.gz" '$2 ~ suffix"$" {print $2;exit}')"
[[ "$filename" =~ ^node-v24\.[0-9]+\.[0-9]+-(linux|darwin)-(x64|arm64)\.tar\.gz$ ]] || { echo 'Unable to resolve official Node release'; exit 1; }
node_root="$cache_root/${filename%.tar.gz}"
if [ ! -x "$node_root/bin/node" ]; then
  archive="$cache_root/$filename"
  printf '[2/5] Download Node runtime\n'
  curl --fail --progress-bar --show-error --location "https://nodejs.org/dist/latest-v24.x/$filename" --output "$archive"
  expected="$(printf '%s\n' "$checksums" | awk -v file="$filename" '$2==file {print $1}')"
  if command -v sha256sum >/dev/null; then actual="$(sha256sum "$archive" | awk '{print $1}')"; else actual="$(shasum -a 256 "$archive" | awk '{print $1}')"; fi
  [ "$expected" = "$actual" ] || { echo 'Node checksum mismatch' >&2; exit 1; }
  tar -xzf "$archive" -C "$cache_root"
fi
export PATH="$node_root/bin:$PATH"
printf '[3/5] Prepare installer source\n'
if [ ! -f "$repo_root/installer/cli.mjs" ]; then
  source_archive="$cache_root/source.tar.gz"
  curl --fail --progress-bar --show-error --location "https://github.com/MiRHaDi/Aphrodite/archive/refs/heads/main.tar.gz" --output "$source_archive"
  source_root="$cache_root/source-$(date +%s)-$$";mkdir -p "$source_root";tar -xzf "$source_archive" -C "$source_root" --strip-components=1;repo_root="$source_root"
fi
cd "$repo_root"
printf '[4/5] Install dependencies (status every 5 seconds)\n'
node installer/bootstrap-dependencies.mjs "$node_root/lib/node_modules/npm/bin/npm-cli.js"
printf '[5/5] Start guided build and deployment\n'
exec node installer/cli.mjs "$@"
