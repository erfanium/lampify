UUID     = lampify@erfanium.local
ZIP      = $(UUID).shell-extension.zip
SOURCES  = metadata.json extension.js prefs.js stylesheet.css lib/*.js icons/*.svg schemas/*.xml

all: $(ZIP)

$(ZIP): $(SOURCES)
	gnome-extensions pack --force \
		--extra-source=lib --extra-source=icons \
		--schema=schemas/org.gnome.shell.extensions.lampify.gschema.xml .

# Installs for the current user. Log out and back in (Wayland) to load it the
# first time, then: gnome-extensions enable $(UUID)
install: $(ZIP)
	gnome-extensions install --force $(ZIP)

uninstall:
	gnome-extensions uninstall $(UUID)

# Runs a nested GNOME Shell with only this extension enabled, without
# touching your real session settings. Run `make install` first.
dev:
	./tools/dev-shell.sh

clean:
	rm -f $(ZIP)

.PHONY: all install uninstall dev clean
