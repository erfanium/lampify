#include <bluetooth/bluetooth.h>
#include <bluetooth/hci.h>
#include <bluetooth/hci_lib.h>
#include <errno.h>
#include <glib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define MAX_BRIGHTNESS 10
#define CONFIG_DIR ".config"
#define CONFIG_FILE "lampify.conf"

static int current_warm = 5;  // default mid-level
static int current_cold = 5;  // default mid-level

char BRIGHTNESS_LEVELS[11] = {0x00, 0x1A, 0x33, 0x4C, 0x66, 0x7F,
                              0x99, 0xB2, 0xCC, 0xE5, 0xFF};

char PACKET_BASE[32] = {0x1F, 0x02, 0x01, 0x01, 0x1B, 0x03, 0x71, 0x0F,
                        0x55, 0xAA, 0x98, 0x43, 0xAF, 0x0B, 0x46, 0x46,
                        0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x83, 0x00,
                        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

int CRC_TABLE[256] = {
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7, 0x8108,
    0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF, 0x1231, 0x0210,
    0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6, 0x9339, 0x8318, 0xB37B,
    0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE, 0x2462, 0x3443, 0x0420, 0x1401,
    0x64E6, 0x74C7, 0x44A4, 0x5485, 0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE,
    0xF5CF, 0xC5AC, 0xD58D, 0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6,
    0x5695, 0x46B4, 0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D,
    0xC7BC, 0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B, 0x5AF5,
    0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12, 0xDBFD, 0xCBDC,
    0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A, 0x6CA6, 0x7C87, 0x4CE4,
    0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41, 0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD,
    0xAD2A, 0xBD0B, 0x8D68, 0x9D49, 0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13,
    0x2E32, 0x1E51, 0x0E70, 0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A,
    0x9F59, 0x8F78, 0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E,
    0xE16F, 0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E, 0x02B1,
    0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256, 0xB5EA, 0xA5CB,
    0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D, 0x34E2, 0x24C3, 0x14A0,
    0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xA7DB, 0xB7FA, 0x8799, 0x97B8,
    0xE75F, 0xF77E, 0xC71D, 0xD73C, 0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657,
    0x7676, 0x4615, 0x5634, 0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9,
    0xB98A, 0xA9AB, 0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882,
    0x28A3, 0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A,
    0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92, 0xFD2E,
    0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9, 0x7C26, 0x6C07,
    0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1, 0xEF1F, 0xFF3E, 0xCF5D,
    0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8, 0x6E17, 0x7E36, 0x4E55, 0x5E74,
    0x2E93, 0x3EB2, 0x0ED1, 0x1EF0};

char* bit_reverse(char* bArr) {
  static char revArr[25];
  for (int i = 0; i < 25; i++) {
    char rev = 0;
    for (int j = 0; j < 8; j++) {
      rev += (((bArr[i] & 255) >> (7 - j)) & 1) << j;
    }
    revArr[i] = rev;
  }
  return revArr;
}

char* ble_whitening(char* bArr) {
  static char whArr[38];
  int i2 = 83;
  int i3 = 0;
  while (i3 < 38) {
    int i4 = i2;
    char b = 0;
    for (int i5 = 0; i5 < 8; i5++) {
      int i6 = i4 & 255;
      b |= ((((i6 & 64) >> 6) << i5) ^ (bArr[i3] & 255)) & (1 << i5);
      int i7 = i6 << 1;
      int i8 = (i7 >> 7) & 1;
      int i9 = (i7 & -2) | i8;
      i4 = ((i9 ^ (i8 << 4)) & 16) | (i9 & -17);
    }
    whArr[i3] = b;
    i2 = i4;
    i3++;
  }
  return whArr;
}

char* ble_whitening_for_packet(char* bArr) {
  char whArr[38];
  for (int i = 0; i < 25; i++) {
    whArr[i + 13] = bArr[i];
  }
  static char whitenedForPacket[25];
  char* bleWhitened = ble_whitening(whArr);
  for (int i = 0; i < 25; i++) {
    whitenedForPacket[i] = bleWhitened[i + 13];
  }
  return whitenedForPacket;
}

int CRC16(char* bArr, int offset) {
  int crc = 65535;
  for (int i = 0; i < 12; i++) {
    crc = CRC_TABLE[((crc >> 8) ^ bArr[offset + i]) & 255] ^ (crc << 8);
  }
  return crc;
}

char* build_master_control() {
  char hostName[1024] = "";
  gethostname(hostName, 1024);
  int crc = CRC16(hostName, 8);
  static char masterControl[2];
  masterControl[0] = (crc >> 8) & 255;
  masterControl[1] = crc & 255;
  return masterControl;
}

char* build_packet(char command, char arg1, char arg2) {
  char* mControl = build_master_control();
  char msgBase[25];
  static char packet[32];
  for (int i = 0; i < 25; i++) {
    msgBase[i] = PACKET_BASE[i + 6];
  }
  msgBase[11] = command;
  msgBase[12] = mControl[0];
  msgBase[13] = mControl[1];
  msgBase[14] = arg1;
  msgBase[15] = arg2;
  msgBase[17] = rand() & 255;
  int crc = CRC16(msgBase, 11);
  msgBase[23] = (crc >> 8) & 255;
  msgBase[24] = crc & 255;
  char* msgRev = bit_reverse(msgBase);
  char* msgWht = ble_whitening_for_packet(msgRev);
  for (int i = 0; i < 6; i++) {
    packet[i] = PACKET_BASE[i];
  }
  for (int i = 0; i < 25; i++) {
    packet[i + 6] = msgWht[i];
  }
  packet[31] = PACKET_BASE[31];
  return packet;
}

int hci_set_params(int dd, int itv, int timeOut) {
  uint8_t status;
  struct hci_request rq;
  le_set_advertising_parameters_cp cp;

  memset(&rq, 0, sizeof(rq));
  memset(&cp, 0, sizeof(cp));

  cp.min_interval = itv;
  cp.max_interval = itv;
  cp.advtype =
      0x03;  // Non-connectable undirected advertising (ADV_NONCONN_IND)
  cp.own_bdaddr_type = 0x00;     // Public address
  cp.direct_bdaddr_type = 0x00;  // Public address
  bacpy(&cp.direct_bdaddr, BDADDR_ANY);
  cp.chan_map = 0x07;  // Use all three advertising channels (37, 38, 39)
  cp.filter = 0x00;    // Allow scan from any, connect from any

  rq.ogf = OGF_LE_CTL;                         // 0x08
  rq.ocf = OCF_LE_SET_ADVERTISING_PARAMETERS;  // 0x0006
  rq.cparam = &cp;
  rq.clen = LE_SET_ADVERTISING_PARAMETERS_CP_SIZE;
  rq.rparam = &status;
  rq.rlen = 1;

  if (hci_send_req(dd, &rq, timeOut) < 0) {
    fprintf(stderr, "[E] Failed to hci_send_req: %s\n", strerror(errno));
    return -1;
  }

  if (status) {
    fprintf(stderr, "[E] Command failed with status: 0x%02X\n", status);
    return -1;
  }

  return 0;
}

int send_packet(char* bArr) {
  int dev = hci_get_route(NULL);
  if (dev < 0) {
    fprintf(stderr, "[E] Failed to find adapter!\n");
    return 1;
  }

  int dd = hci_open_dev(dev);
  if (dd < 0) {
    fprintf(stderr, "[E] Failed to open dd!\n");
    return 1;
  }

  if (hci_send_cmd(dd, OGF_HOST_CTL, OCF_RESET, 0, NULL) < 0) {
    fprintf(stderr, "[W] Couldn't reset controller (may be okay)\n");
  }

  if (hci_set_params(dd, 0x0020, 1000) < 0) {
    fprintf(stderr, "[E] Failed to set advertising parameters!\n");
    return 1;
  }
  if (hci_send_cmd(dd, 0x08, 0x0008, 32, bArr) < 0) {
    fprintf(stderr, "[E] Failed to set advertising data!\n");
    return 1;
  }
  if (hci_le_set_advertise_enable(dd, 0x01, 1000) < 0) {
    fprintf(stderr, "[E] Failed to start advertising!\n");
    return 1;
  }
  usleep(100000);
  if (hci_le_set_advertise_enable(dd, 0x00, 1000) < 0) {
    fprintf(stderr, "[E] Failed to stop advertising!\n");
    return 1;
  }
  hci_close_dev(dd);
  return 0;
}

char* get_config_path() {
  const char* home = g_get_home_dir();
  return g_build_filename(home, CONFIG_DIR, "lampify", CONFIG_FILE, NULL);
}

void load_config() {
  char* path = get_config_path();
  GKeyFile* keyfile = g_key_file_new();
  GError* error = NULL;

  if (g_file_test(path, G_FILE_TEST_EXISTS) &&
      g_key_file_load_from_file(keyfile, path, G_KEY_FILE_NONE, &error)) {
    current_warm =
        g_key_file_get_integer(keyfile, "Brightness", "Warm", &error);
    if (error) {
      g_clear_error(&error);
      current_warm = 5;
    }

    current_cold =
        g_key_file_get_integer(keyfile, "Brightness", "Cold", &error);
    if (error) {
      g_clear_error(&error);
      current_cold = 5;
    }
  }

  g_key_file_free(keyfile);
  g_free(path);
}

void save_config() {
  char* path = get_config_path();
  char* dir = g_path_get_dirname(path);

  if (g_mkdir_with_parents(dir, 0755) == -1) {
    g_free(dir);
    g_free(path);
    return;
  }

  GKeyFile* keyfile = g_key_file_new();
  GError* error = NULL;

  g_key_file_set_integer(keyfile, "Brightness", "Warm", current_warm);
  g_key_file_set_integer(keyfile, "Brightness", "Cold", current_cold);

  if (!g_key_file_save_to_file(keyfile, path, &error)) {
    g_printerr("Failed to save config: %s\n", error->message);
    g_clear_error(&error);
  }

  g_key_file_free(keyfile);
  g_free(dir);
  g_free(path);
}

int decode_command(char* command, char* arg1, char* arg2) {
  char* packet = NULL;
  char ntfText[128] = "";

  if (command) {
    if (!strcmp(command, "setup")) {
      char* mControl = build_master_control();
      packet = build_packet(0x28, mControl[0], mControl[1]);
      sprintf(ntfText, "Connecting to the lamp");
    } else if (!strcmp(command, "on")) {
      packet = build_packet(0x10, 0x00, 0x00);
      sprintf(ntfText, "Turning the lamp on");
    } else if (!strcmp(command, "off")) {
      packet = build_packet(0x11, 0x00, 0x00);
      sprintf(ntfText, "Turning the lamp off");
    } else if (!strcmp(command, "set")) {
      if (arg1 && arg2) {
        current_warm = atoi(arg1) % (MAX_BRIGHTNESS + 1);
        current_cold = atoi(arg2) % (MAX_BRIGHTNESS + 1);
        char warm_value = BRIGHTNESS_LEVELS[current_warm];
        char cold_value = BRIGHTNESS_LEVELS[current_cold];

        packet = build_packet(0x21, cold_value, warm_value);
        sprintf(ntfText, "Setting brightness to warm:%d cold:%d", current_warm,
                current_cold);
        save_config();
      }
    } else if (!strcmp(command, "warm")) {
      if (arg1) {
        if (!strcmp(arg1, "inc") && current_warm < MAX_BRIGHTNESS) {
          current_warm++;
        } else if (!strcmp(arg1, "dec") && current_warm > 0) {
          current_warm--;
        }
        char warm_value = BRIGHTNESS_LEVELS[current_warm];
        char cold_value = BRIGHTNESS_LEVELS[current_cold];

        packet = build_packet(0x21, cold_value, warm_value);
        sprintf(ntfText, "Warm brightness %s to %d",
                !strcmp(arg1, "inc") ? "increased" : "decreased", current_warm);
        save_config();
      }
    } else if (!strcmp(command, "cold")) {
      if (arg1) {
        if (!strcmp(arg1, "inc") && current_cold < MAX_BRIGHTNESS) {
          current_cold++;
        } else if (!strcmp(arg1, "dec") && current_cold > 0) {
          current_cold--;
        }
        char warm_value = BRIGHTNESS_LEVELS[current_warm];
        char cold_value = BRIGHTNESS_LEVELS[current_cold];

        packet = build_packet(0x21, cold_value, warm_value);
        sprintf(ntfText, "Cold brightness %s to %d",
                !strcmp(arg1, "inc") ? "increased" : "decreased", current_cold);
        save_config();
      }
    }
  }

  if (packet) {
    fprintf(stdout, "[I] %s\n", ntfText);
    return send_packet(packet);
  }
  return -1;
}

void print_usage(char* basename) {
  fprintf(stderr, "Lampify\n");
  fprintf(stderr, "Made in Ukraine and Iran\n\n");
  fprintf(stderr, "Usage:\n");
  fprintf(stderr, "%s <command> [parameters]\n\n", basename);
  fprintf(stderr, "Available commands:\n");
  fprintf(stderr, "setup           connect to the lamp\n");
  fprintf(stderr, "on              turn the lamp on\n");
  fprintf(stderr, "off             turn the lamp off\n");
  fprintf(stderr, "set <w> <c>     set warm and cold brightness (0-%d)\n",
          MAX_BRIGHTNESS);
  fprintf(stderr, "warm inc|dec    increase/decrease warm brightness\n");
  fprintf(stderr, "cold inc|dec    increase/decrease cold brightness\n");
}

int main(int argc, char** argv) {
  srand(clock());
  load_config();  // Load saved values at startup

  if (argc < 2) {
    print_usage(argv[0]);
    return 1;
  }

  int ret = -1;
  if (!strcmp(argv[1], "set") && argc >= 4) {
    ret = decode_command(argv[1], argv[2], argv[3]);
  } else if ((!strcmp(argv[1], "warm") || !strcmp(argv[1], "cold")) &&
             argc >= 3) {
    ret = decode_command(argv[1], argv[2], NULL);
  } else if (argc >= 2) {
    ret = decode_command(argv[1], NULL, NULL);
  }

  if (ret != 0) {
    if (ret < 0) {
      print_usage(argv[0]);
    }
    return 1;
  }
  return 0;
}