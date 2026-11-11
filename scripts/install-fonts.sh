#!/bin/sh
# Runs inside the Debian Docker build, not on macOS.
set -eu
font_dir="${1:-/opt/hikmah-font-packages}"
core_package=''
extra_package=''

for font_file in "$font_dir"/*.deb; do
  [ -f "$font_file" ] || continue
  if ! font_name="$(dpkg-deb --field "$font_file" Package)"; then
    printf 'Cannot read font package: %s\n' "$font_file" >&2
    exit 1
  fi
  font_arch="$(dpkg-deb --field "$font_file" Architecture)"
  if [ "$font_arch" != all ]; then
    printf 'Font package %s must have Architecture: all for Intel and Apple silicon.\n' "$font_file" >&2
    exit 1
  fi
  case "$font_name" in
    fonts-noto-core)
      [ -z "$core_package" ] || { printf 'Keep only one fonts-noto-core package in docker-packages.\n' >&2; exit 1; }
      core_package="$font_file"
      ;;
    fonts-noto-extra)
      [ -z "$extra_package" ] || { printf 'Keep only one fonts-noto-extra package in docker-packages.\n' >&2; exit 1; }
      extra_package="$font_file"
      ;;
    *) printf 'Unexpected package %s; docker-packages is for the two Noto font archives only.\n' "$font_name" >&2; exit 1 ;;
  esac
done

if [ -n "$core_package" ] || [ -n "$extra_package" ]; then
  if [ -z "$core_package" ] || [ -z "$extra_package" ]; then
    printf 'Local font installation needs both fonts-noto-core and fonts-noto-extra .deb files.\n' >&2
    exit 1
  fi
  printf 'Using local Noto font packages from docker-packages; no Noto archive download.\n'
  # apt can prefer a repository URI even when given same-version local files.
  # Install these architecture-independent font archives directly to avoid that.
  DEBIAN_FRONTEND=noninteractive dpkg --install "$core_package" "$extra_package"
else
  printf 'No local font archives found; installing Noto fonts from Debian.\n'
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-extra
fi
fc-cache -f
