const BASE_RTOS = [
  'MH01 - CENTRAL',
  'MH02 - MUMBAI WEST',
  'MH03 - MUMBAI EAST',
  'MH04 - THANE',
  'MH05 - KALYAN',
  'MH06 - PEN (RAIGAD)',
  'MH07 - SINDHUDURG',
  'MH08 - RATNAGIRI',
  'MH09 - KOLHAPUR',
  'MH10 - SANGLI',
  'MH11 - SATARA',
  'MH12 - PUNE',
  'MH13 - SOLAPUR',
  'MH14 - PCMC',
  'MH15 - NASHIK',
  'MH16 - AHMEDNAGAR',
  'MH17 - SHRIRAMPUR',
  'MH18 - DHULE',
  'MH19 - JALGAON',
  'MH20 - SAMBHAJI NAGAR',
  'MH21 - JALNA',
  'MH22 - PARBHANI',
  'MH23 - BEED',
  'MH24 - LATUR',
  'MH25 - DHARASHIV',
  'MH26 - NANDED',
  'MH27 - AMRAVATI',
  'MH28 - BULDHANA',
  'MH29 - YAVATMAL',
  'MH30 - AKOLA',
  'MH31 - NAGPUR (URBAN)',
  'MH32 - WARDHA',
  'MH33 - GADCHIROLI',
  'MH34 - CHANDRAPUR',
  'MH35 - GONDIYA',
  'MH36 - BHANDARA',
  'MH37 - WASHIM',
  'MH38 - HINGOLI',
  'MH39 - NANDURBAR',
  'MH40 - NAGPUR (RURAL)',
  'MH41 - MALEGAON',
  'MH42 - BARAMATI',
  'MH43 - VASHI',
  'MH44 - AMBEJOGAI',
  'MH45 - AKLUJ',
  'MH46 - PANVEL',
  'MH47 - BORIVALI',
  'MH48 - VASAI',
  'MH49 - NAGPUR (EAST)',
  'MH50 - KARAD',
  'MH51 - PHALTAN',
  'MH52 - UDGIR',
];
function rtoKey(name) {
  return String(name || '')
    .trim()
    .toUpperCase()
    .split(/[\s-]+/)[0];
}

const BASE_RTO_KEYS = new Set(BASE_RTOS.map(rtoKey));

module.exports = { BASE_RTOS, BASE_RTO_KEYS, rtoKey };
