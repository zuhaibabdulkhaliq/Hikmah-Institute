# Optional local font packages

Place your downloaded Debian Bookworm packages here:

```text
fonts-noto-core_20201225-1_all.deb
fonts-noto-extra_20201225-1_all.deb
```

Then run `bash scripts/demo.sh start` from the project root. The Docker build validates the package identities and architecture and installs both local archives inside Linux, avoiding another Noto download. `all` packages work with both Apple silicon and Intel containers. Do not install `.deb` files on macOS itself.

With neither archive present, the build uses the normal Debian repository. With only one package, a duplicate, a corrupt archive or an unexpected package, it stops with an error instead of silently downloading the missing font package.

Archives are ignored by Git and are not copied into the final application image. Keep this README/directory in the checkout even when using the default online install. Internet is still needed for other uncached system, Python and Node dependencies.
