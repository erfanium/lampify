CC     = gcc
BASE   = lampify
INST   = /usr/local/bin/
CFLAG  = -Wall -Ofast

PKG_CFLAGS = $(shell pkg-config --cflags glib-2.0 gdk-pixbuf-2.0 libnotify)
PKG_LIBS   = $(shell pkg-config --libs glib-2.0 gdk-pixbuf-2.0 libnotify)

INC    = $(PKG_CFLAGS)
LIB    = -lbluetooth $(PKG_LIBS)

SRC    = $(BASE).c
OBJ    = $(SRC:.c=.o)

all: $(BASE)

$(BASE): $(OBJ)
	$(CC) $(CFLAG) -o $@ $^ $(LIB)

%.o: %.c
	$(CC) $(CFLAG) $(INC) -c -o $@ $<

clean:
	rm -f $(BASE) $(OBJ)

install: all
	install -d $(INST)
	install -m 755 $(BASE) $(INST)
	setcap 'cap_net_raw,cap_net_admin+eip' $(INST)$(BASE)

uninstall:
	rm -f $(INST)$(BASE)

.PHONY: all clean install uninstall