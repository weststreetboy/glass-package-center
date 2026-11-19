// 机型与平台数据同步自 weststreetboy/sspks-imnks 的 conf/synology_models.yaml
// 共 137 个机型 / 25 个平台
export type ModelGroup = { arch: "x86_64" | "armv8"; platform: string; models: string[] };

export const MODEL_GROUPS: ModelGroup[] = [
  { arch: "armv8", platform: "armada37xx", models: ["DS119j", "DS120j"] },
  { arch: "armv8", platform: "rtd1296", models: ["DS118", "DS218", "DS218play", "DS418", "DS418j", "RS819", "DS220j", "DS420j"] },
  { arch: "armv8", platform: "rtd1619b", models: ["DS124", "DS223", "DS223j", "DS423"] },
  { arch: "x86_64", platform: "apollolake", models: ["DS218+", "DS418play", "DS718+", "DS918+", "DS1019+", "DS620slim"] },
  { arch: "x86_64", platform: "avoton", models: ["DS415+", "DS1515+", "DS1815+", "DS2415+", "RS815(RP)+", "RS2416(RP)+", "DS1517+", "DS1817+", "RS818(RP)+", "RS1219+"] },
  { arch: "x86_64", platform: "braswell", models: ["DS216+", "DS216+II", "DS416play", "DS716+", "DS716+II", "DS916+"] },
  { arch: "x86_64", platform: "broadwell", models: ["DS3617xs", "FS2017", "RS18017xs+", "RS3617RPxs", "RS3617xs+", "RS4017xs+", "DS3617xsII", "RS3618xs", "RS1619xs+", "FS3400"] },
  { arch: "x86_64", platform: "broadwellnk", models: ["DS3018xs", "FS1018", "SA3400", "FS3600", "SA3600", "DS1621xs+", "RS3621RPxs", "RS3621xs+", "RS4021xs+", "DS3622xs+"] },
  { arch: "x86_64", platform: "broadwellnkv2", models: ["FS3410", "SA3410", "SA3610"] },
  { arch: "x86_64", platform: "broadwellntbap", models: ["SA3400D", "SA3200D"] },
  { arch: "x86_64", platform: "bromolow", models: ["RS10613xs+", "RS3413xs+", "RS3614(RP)xs", "RS3614xs+", "DS3615xs", "RC18015xs+", "RS10815xs+", "RS18016xs+", "RS3617xs"] },
  { arch: "x86_64", platform: "cedarview", models: ["DS713+", "DS1513+", "DS1813+", "DS2413+", "RS814(RP)+", "RS2414(RP)+"] },
  { arch: "x86_64", platform: "denverton", models: ["DS1618+", "RS2418(RP)+", "RS2818RP+", "DS1819+", "DS2419+", "DVA3219", "DS2419+II", "RS820(RP)+", "DVA3221"] },
  { arch: "x86_64", platform: "epyc7002", models: ["SA6400"] },
  { arch: "x86_64", platform: "epyc7003", models: ["FS6420", "PAS7700", "RS11626xs+"] },
  { arch: "x86_64", platform: "geminilake", models: ["DS220+", "DS420+", "DS720+", "DS920+", "DS1520+", "DVA1622", "DS423+", "DS224+", "DS225+"] },
  { arch: "x86_64", platform: "geminilakenk", models: ["DS425+", "DS625slim", "FS200T"] },
  { arch: "x86_64", platform: "grantley", models: ["FS3017"] },
  { arch: "x86_64", platform: "icelaked", models: ["FS3420", "RS1626xs+", "RS3626xs", "RS4826xs+", "RS6426xs+"] },
  { arch: "x86_64", platform: "kvmx64", models: ["VirtualDSM"] },
  { arch: "x86_64", platform: "purley", models: ["FS6400", "HD6500"] },
  { arch: "x86_64", platform: "r1000", models: ["DS1522+", "RS422+", "DS723+", "DS923+"] },
  { arch: "x86_64", platform: "r1000nk", models: ["DS725+", "DS725neo+"] },
  { arch: "x86_64", platform: "v1000", models: ["DS1621+", "DS1821+", "RS1221(RP)+", "RS2421(RP)+", "RS2821RP+", "DS2422+", "FS2500", "RS822(RP)+", "DS1823xs+", "RS2423(RP)+", "RS826(RP)+"] },
  { arch: "x86_64", platform: "v1000nk", models: ["RS2423RP+II", "DS925+", "DS1525+", "DS1825+", "DS1825xs+", "RS2825RP+", "RS1226(RP)+", "DS925neo+", "DS1525neo+", "DS1825neo+"] },
];

export const MODEL_ARCHS = ["x86_64", "armv8"] as const;
