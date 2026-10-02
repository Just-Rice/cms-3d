// Building layout transcribed from the Community Middle School floor plan handout
// (docs/floorplan.jpg: the first floor, plus the second floor of the 700s/900s wing drawn
// separately in its bottom-right corner).
//
// Every rectangle is written in "plan units": pixel coordinates on docs/floorplan.jpg, as
// [x0, y0, x1, y1] with x to the right and y down. The plan's up direction points 15 degrees
// east of true north, so plan x runs about ESE and plan y about SSW.
//
// Plan units are converted to meters with a fit to the real footprint: the 2015 USGS LiDAR
// survey for the original building, and the satellite view for the 2020-21 additions (gym,
// main office, Media Center, 900s/1000s wing). The handout isn't quite to scale, so a few
// wings get their own small correction on top of the global fit (WINGS below).

// meters per plan unit (east-west, north-south), from the footprint fit
export const SX = 0.14027;
export const SZ = 0.14475;
const OX = 86;
const OY = 375;

// Per-wing corrections, in plan units: scale about `at`, then shift by d.
const WINGS = {
  // 700s/800s wing: fitted to the LiDAR footprint (29 m wide, 66 m long)
  S: { at: [1473, 460], s: [1.0412, 1.0245], d: [-11.0, -9.5] },
  // 6th Grade Annex: drawn small on the handout
  A: { at: [1175, 281], s: [1.0049, 1.0667], d: [-0.2, -17.6] },
  // 300s: the handout draws them short north-south
  E: { at: [1190, 817], s: [1, 1.088], d: [0, 0] },
};
// The second-floor drawing is a separate, slightly rotated copy: this maps its pixels onto
// the first floor's (least-squares fit to the stairs and corners of the wing, +-0.7 m).
const F2M = [[1.04711, 0.02249, -362.79], [0.01375, 1.02854, -254.93]];

export const fixPt = (x, y, wing) => {
  const w = WINGS[wing];
  if (!w) return [x, y];
  return [w.at[0] + (x - w.at[0]) * w.s[0] + w.d[0], w.at[1] + (y - w.at[1]) * w.s[1] + w.d[1]];
};
const fixRect = (r, wing) => {
  const [a, b] = fixPt(r[0], r[1], wing), [c, d] = fixPt(r[2], r[3], wing);
  return [a, b, c, d];
};
const f2Rect = (r) => {
  const t = (x, y) => [F2M[0][0] * x + F2M[0][1] * y + F2M[0][2], F2M[1][0] * x + F2M[1][1] * y + F2M[1][2]];
  const p00 = t(r[0], r[1]), p01 = t(r[0], r[3]), p10 = t(r[2], r[1]), p11 = t(r[2], r[3]);
  return [(p00[0] + p01[0]) / 2, (p00[1] + p10[1]) / 2, (p10[0] + p11[0]) / 2, (p01[1] + p11[1]) / 2];
};

// Inside walls are concrete block. Heights below are whole block courses so the block lines
// up with floors, ceilings and door heads.
export const CMU = 0.2032; // 8 in block course
const CEIL = 15 * CMU; // classrooms and hallways (to be confirmed)
export const LEVEL_H = 21 * CMU; // 700s/900s wing floor to floor (4.27 m; the LiDAR puts its roof deck at 8.6 m)
export const SLAB = 0.3;
export const CEIL2 = [CEIL, LEVEL_H + CEIL];
export const DOOR_H = 2.13; // 7 ft doors

export const wx = (px) => (px - OX) * SX;
export const wz = (py) => (py - OY) * SZ;
export const rectW = (r) => [wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])];
// true north, clockwise from the plan's up direction (world -Z)
export const NORTH = (-15 * Math.PI) / 180;

// ---------------------------------------------------------------------------------------
// Rooms: R(label, rect, type, wing, extra). Doors are found automatically (the side that
// faces a hallway) unless `doors` is given: 'E' | 'E:0.3' (fraction along) | 'E:0.3:2.4' (m).
// ---------------------------------------------------------------------------------------
const R = (label, r, type, wing, extra = {}) => ({ label, r, type, wing, ...extra });
const ST = (id, r, open, wing) => ({ label: 'Stairs', id, r, type: 'stair', open, wing, doors: [] });
const N = (name, r, type, wing, extra = {}) => R('', r, type, wing, { name, ...extra });

const F1 = [
  // ---------------- west wing: fitness, aux gym, kitchen, 500s, auditorium, Commons
  R('Aux Gym', [86, 590, 172, 752], 'gym', 'W', { name: 'Auxiliary Gym', big: true, doors: ['E:0.3:1.8', 'E:0.8:1.8'] }),
  N('Gym Storage', [78, 752, 148, 837], 'storage', 'W', { doors: ['S:0.7'] }),
  N('Restroom', [150, 760, 172, 780], 'lav', 'W'), N('Restroom', [150, 780, 172, 800], 'lav', 'W'),
  N('IDF Closet', [202, 592, 220, 612], 'storage', 'W', { doors: ['N'] }), N('Closet', [220, 592, 265, 613], 'storage', 'W', { doors: ['N'] }),
  N('Mechanical', [283, 593, 337, 610], 'storage', 'W', { doors: ['N'] }), R('606', [337, 588, 367, 630], 'class', 'W', { doors: ['N'] }),
  N('Fitness Center', [200, 613, 262, 730], 'weights', 'W', { big: true, doors: ['W:0.2:1.6', 'E:0.5:1.6'] }),
  N('Storage', [193, 730, 257, 760], 'storage', 'W'),
  N("Girls' Restroom", [330, 703, 367, 750], 'lav', 'W'),
  N("Girls' Locker Room", [193, 767, 332, 837], 'locker', 'W', { doors: ['S:0.3:1.6', 'S:0.8'] }),
  N("Boys' Restroom", [332, 780, 373, 837], 'lav', 'W'),
  R('Team Rm 01', [165, 509, 200, 558], 'office', 'W', { name: 'Team Room 01', doors: ['S:0.86:1.0'] }),
  N('Closet', [165, 558, 192, 573], 'storage', 'W', { doors: ['S'] }),
  R('Team Rm 02', [200, 509, 234, 558], 'office', 'W', { name: 'Team Room 02', doors: ['S:0.2:1.0'] }),
  N('Closet', [212, 558, 234, 573], 'storage', 'W', { doors: ['S'] }),
  N('Weight Room', [234, 508, 342, 573], 'weights', 'W', { doors: ['S:0.2:1.6', 'S:0.85'] }),
  N('Kitchen', [410, 485, 517, 573], 'kitchen', 'W', { doors: ['S:0.3:1.8', 'S:0.75:1.8'] }),
  R('505', [473, 537, 515, 557], 'office', 'W', { doors: ['W'] }),
  R('504', [502, 408, 582, 480], 'class', 'W', { doors: ['S:0.4'] }),
  R('503B', [517, 480, 613, 520], 'class', 'W', { doors: ['S:0.08'] }),
  R('503A', [533, 520, 600, 580], 'class', 'W'),
  N('Storage', [600, 500, 640, 580], 'storage', 'W'),
  R('502', [640, 480, 693, 580], 'class', 'W'), R('501', [693, 480, 740, 580], 'class', 'W'),
  N('Auditorium', [510, 600, 750, 735], 'theatre', 'W', { big: true, doors: ['N:0.08:1.8', 'S:0.08:1.8', 'N:0.55:1.6', 'S:0.55:1.6'] }),
  N('Commons', [367, 600, 510, 735], 'dining', 'W', { big: true, doors: ['S:0.3:3.0', 'S:0.75:3.0', 'W:0.35:3.0', 'N:0.5:2.4', 'W:0.85:1.8'] }),
  // ---------------- gym addition (2021)
  N('Gym', [85, 862, 282, 1066], 'gym', 'G', { big: true, doors: ['N:0.25:2.0', 'N:0.75:2.0', 'E:0.3:2.0', 'S:0.27:1.8', 'S:0.8:1.8'] }),
  N("Men's Restroom", [303, 867, 373, 883], 'lav', 'G'), N("Women's Restroom", [310, 885, 370, 907], 'lav', 'G'),
  N('Mech Room', [303, 937, 377, 953], 'storage', 'G'),
  N("Boys' Locker Room", [305, 953, 372, 1060], 'locker', 'G', { doors: ['W:0.2'] }),
  N('Restroom', [283, 1003, 303, 1027], 'lav', 'G'),
  // ---------------- main office and the 100s
  R('D', [507, 757, 522, 777], 'office', 'O', { doors: ['E'] }),
  R('102', [522, 755, 580, 778], 'office', 'O', { doors: ['S'] }),
  R('100', [505, 778, 580, 858], 'office', 'O', { name: 'Main Office', big: true, doors: ['E:0.3:1.6', 'W:0.5:1.6', 'S:0.6'] }),
  R('99', [505, 860, 542, 877], 'office', 'O'), R('98', [505, 878, 540, 900], 'office', 'O', { doors: ['E'] }),
  R('97', [505, 902, 530, 942], 'office', 'O', { doors: ['N'] }), R('96', [530, 912, 553, 942], 'office', 'O'), R('95', [553, 912, 590, 942], 'office', 'O'),
  N('Restroom', [562, 862, 580, 878], 'lav', 'O'), N('Restroom', [562, 880, 580, 902], 'lav', 'O'),
  R('94', [617, 877, 637, 893], 'office', 'O'), R('94A', [637, 872, 673, 897], 'office', 'O', { doors: ['N'] }), R('94B', [637, 898, 673, 922], 'office', 'O', { doors: ['W'] }),
  R('94C', [637, 922, 673, 942], 'office', 'O', { doors: ['W'] }), R('94D', [637, 942, 673, 962], 'office', 'O', { doors: ['W'] }), R('94E', [607, 937, 637, 960], 'office', 'O', { doors: ['W'] }),
  R('Nurse', [597, 753, 653, 857], 'office', 'O', { name: "Nurse's Office", doors: ['W:0.5'] }),
  R('105', [670, 753, 705, 785], 'class', 'O', { doors: ['S:0.5'] }), R('106', [655, 785, 705, 857], 'class', 'O', { doors: ['S:0.5'] }),
  R('107', [705, 753, 735, 785], 'class', 'O', { doors: ['E'] }), R('108', [705, 785, 735, 857], 'class', 'O', { doors: ['E'] }),
  // ---------------- 400s and the 8th Grade Concourse
  R('408', [793, 398, 858, 448], 'class', 'C', { doors: ['E'] }), R('407', [790, 448, 858, 498], 'class', 'C', { doors: ['E'] }),
  R('409', [858, 375, 903, 440], 'class', 'C'), R('410', [903, 375, 962, 437], 'class', 'C'), R('411', [962, 375, 1012, 433], 'class', 'C'), R('412', [1012, 375, 1065, 433], 'class', 'C'),
  R('413', [1065, 393, 1133, 442], 'class', 'C', { doors: ['W:0.88'] }), R('414', [1065, 442, 1133, 493], 'class', 'C', { doors: ['W:0.85'] }),
  N("Boys' Restroom", [858, 452, 893, 482], 'lav', 'C'), N("Girls' Restroom", [1030, 443, 1065, 480], 'lav', 'C'),
  R('401', [758, 498, 850, 560], 'class', 'C', { doors: ['E'] }), R('405', [850, 498, 893, 547], 'class', 'C', { doors: ['N'] }),
  R('402', [823, 560, 850, 580], 'office', 'C', { doors: ['S'] }), R('403', [850, 560, 872, 580], 'office', 'C', { doors: ['S'] }), R('404', [872, 560, 893, 580], 'office', 'C', { doors: ['S'] }),
  N('Concourse Room', [923, 502, 1000, 572], 'class', 'C', { doors: ['N:0.5:1.6', 'S:0.5:1.6'] }),
  R('416', [1030, 493, 1083, 577], 'class', 'C', { doors: ['S'] }), R('417', [1083, 493, 1112, 537], 'office', 'C', { doors: ['S'] }), R('418', [1112, 493, 1165, 577], 'class', 'C', { doors: ['S'] }),
  // ---------------- 600s
  R('611', [745, 582, 840, 667], 'music', 'C', { doors: ['E'] }), R('612', [745, 667, 840, 753], 'music', 'C', { doors: ['E'] }),
  N('Office', [857, 600, 907, 667], 'office', 'C', { doors: ['W'] }), N('Storage', [857, 667, 907, 690], 'storage', 'C', { doors: ['W'] }),
  R('615', [907, 597, 1000, 690], 'class', 'C', { doors: ['E:0.5:1.6'] }),
  R('613A', [857, 693, 893, 733], 'office', 'C', { doors: ['S'] }), R('613B', [893, 693, 927, 733], 'office', 'C', { doors: ['S'] }), R('613C', [927, 693, 943, 733], 'office', 'C', { doors: ['S'] }),
  R('614', [943, 693, 1000, 733], 'class', 'C', { doors: ['S'] }),
  R('618', [1030, 600, 1062, 643], 'office', 'C', { doors: ['W'] }), R('617', [1132, 600, 1163, 643], 'office', 'C', { doors: ['W'] }),
  R('616', [1062, 615, 1132, 715], 'class', 'C', { doors: ['W:0.5:1.6'] }),
  R('619', [1030, 693, 1062, 733], 'office', 'C', { doors: ['W'] }), R('620', [1132, 683, 1163, 700], 'office', 'C', { doors: ['W'] }), R('621', [1132, 710, 1163, 733], 'office', 'C', { doors: ['S'] }),
  // ---------------- 200s and the 7th Grade Concourse
  R('201', [753, 755, 847, 838], 'class', 'C', { doors: ['N:0.2'] }), R('202', [812, 755, 847, 788], 'office', 'C', { doors: ['N'] }),
  R('203', [847, 755, 868, 780], 'office', 'C', { doors: ['N'] }), R('204', [868, 755, 892, 790], 'office', 'C', { doors: ['N'] }), R('206', [847, 790, 892, 838], 'class', 'C', { doors: ['S'] }),
  N('Concourse Room', [922, 762, 1000, 830], 'class', 'C', { doors: ['N:0.5:1.6', 'S:0.5:1.6'] }),
  R('216', [1030, 755, 1085, 838], 'class', 'C', { doors: ['N'] }), R('217', [1085, 800, 1112, 838], 'office', 'C', { doors: ['N'] }), R('218', [1112, 755, 1165, 838], 'class', 'C', { doors: ['N'] }),
  R('207', [788, 838, 855, 887], 'class', 'C', { doors: ['E'] }), R('208', [783, 887, 855, 937], 'class', 'C', { doors: ['N:0.85'] }), N("Boys' Restroom", [855, 853, 892, 887], 'lav', 'C'),
  R('209', [855, 895, 908, 957], 'class', 'C'), R('210', [908, 895, 960, 957], 'class', 'C'), R('211', [960, 895, 988, 957], 'office', 'C', { doors: ['N'] }),
  R('212', [1008, 895, 1065, 957], 'class', 'C', { doors: ['N:0.2'] }), N("Girls' Restroom", [1030, 850, 1065, 877], 'lav', 'C', { doors: ['W'] }),
  R('214', [1065, 838, 1130, 877], 'class', 'C', { doors: ['S'] }), R('213', [1065, 887, 1130, 933], 'class', 'C', { doors: ['N'] }),
  N('Custodian', [1133, 850, 1170, 870], 'storage', 'C', { doors: ['W'] }), N("Women's Restroom", [1133, 872, 1152, 893], 'lav', 'C', { doors: ['W'] }),
  N("Men's Restroom", [1152, 872, 1170, 887], 'lav', 'C', { doors: ['E'] }), N('Closet', [1133, 898, 1170, 920], 'storage', 'C', { doors: ['E'] }),
  // ---------------- Media Center (2021)
  N('Media Center', [959, 1002, 1171, 1115], 'media', 'M', { big: true, doors: ['N:0.15:1.8', 'E:0.4:1.8'] }),
  // ---------------- 300s and the 6th Grade Concourse
  R('315', [1188, 512, 1240, 575], 'class', 'E', { doors: ['S'] }), R('314', [1240, 512, 1293, 575], 'class', 'E', { doors: ['S'] }),
  R('313', [1293, 497, 1350, 560], 'class', 'E', { doors: ['S'] }), R('312', [1350, 497, 1400, 560], 'class', 'E', { doors: ['S'] }),
  R('311', [1167, 600, 1227, 663], 'class', 'E', { doors: ['N'] }), R('306', [1167, 663, 1227, 728], 'class', 'E', { doors: ['S'] }),
  R('309', [1228, 633, 1253, 648], 'office', 'E', { doors: ['S'] }), R('310', [1253, 633, 1277, 648], 'office', 'E', { doors: ['S'] }),
  R('307', [1228, 683, 1253, 697], 'office', 'E', { doors: ['N'] }), R('308', [1253, 683, 1277, 697], 'office', 'E', { doors: ['N'] }),
  N("Boys' Restroom", [1330, 633, 1355, 653], 'lav', 'E', { doors: ['W'] }), N("Girls' Restroom", [1330, 678, 1355, 698], 'lav', 'E', { doors: ['W'] }),
  R('305', [1355, 600, 1420, 718], 'office', 'E', { name: 'Work Room 305', doors: ['W'] }),
  N('Storage', [1355, 718, 1385, 743], 'storage', 'E', { doors: ['S'] }), N('Storage', [1385, 718, 1420, 743], 'storage', 'E', { doors: ['S'] }),
  N('Storage', [1305, 752, 1322, 767], 'storage', 'E', { doors: ['N'] }), N('Restroom', [1322, 752, 1340, 767], 'lav', 'E', { doors: ['N'] }),
  R('301', [1190, 752, 1240, 817], 'class', 'E', { doors: ['N'] }), R('302', [1240, 752, 1293, 817], 'class', 'E', { doors: ['N'] }),
  R('303', [1293, 767, 1347, 830], 'class', 'E', { doors: ['N:0.1'] }), R('304', [1347, 767, 1402, 830], 'class', 'E', { doors: ['N'] }),
  // ---------------- 6th Grade Annex
  R('324', [1175, 281, 1203, 335], 'office', 'A', { doors: ['S'] }), R('323', [1203, 281, 1257, 343], 'class', 'A'), R('322', [1257, 281, 1310, 343], 'class', 'A'),
  R('321', [1310, 281, 1364, 343], 'class', 'A'), R('320', [1364, 281, 1422, 343], 'class', 'A'),
  R('325', [1203, 368, 1250, 393], 'office', 'A', { doors: ['N'] }), N("Boys' Restroom", [1268, 368, 1310, 393], 'lav', 'A', { doors: ['N'] }),
  N("Girls' Restroom", [1310, 368, 1352, 393], 'lav', 'A', { doors: ['N'] }), R('326', [1378, 365, 1422, 393], 'office', 'A', { doors: ['N'] }),
  R('316', [1203, 393, 1258, 452], 'class', 'A', { doors: ['W'] }), R('317', [1258, 393, 1313, 452], 'class', 'A', { doors: ['N:0.08'] }),
  R('318', [1313, 393, 1368, 452], 'class', 'A', { doors: ['N:0.5'] }), R('319', [1368, 393, 1422, 452], 'class', 'A', { doors: ['N:0.2'] }),
  // ---------------- 700s
  R('711', [1473, 460, 1552, 560], 'class', 'S', { doors: ['S:0.2', 'S:0.8'] }),
  ST('Blue', [1555, 460, 1605, 500], 'S', 'S'),
  R('712', [1475, 583, 1552, 637], 'class', 'S', { doors: ['E'] }), R('713', [1475, 637, 1552, 688], 'class', 'S', { doors: ['E'] }),
  N("Boys' Restroom", [1475, 688, 1517, 712], 'lav', 'S', { doors: ['E'] }), N("Girls' Restroom", [1475, 712, 1517, 735], 'lav', 'S', { doors: ['E:0.3'] }),
  N('Elevator', [1530, 722, 1552, 737], 'storage', 'S', { doors: ['N'] }),
  R('710', [1580, 518, 1662, 558], 'class', 'S', { doors: ['W'] }), R('709', [1580, 558, 1662, 612], 'class', 'S', { doors: ['W'] }),
  R('707', [1602, 612, 1682, 680], 'class', 'S', { doors: ['W:0.2'] }), R('708', [1578, 653, 1602, 708], 'office', 'S', { doors: ['W'] }),
  R('706', [1602, 680, 1680, 752], 'class', 'S', { doors: ['W:0.8'] }),
  R('705', [1578, 752, 1657, 802], 'class', 'S', { doors: ['W'] }), R('704', [1578, 802, 1657, 852], 'class', 'S', { doors: ['W'] }),
  ST('Red', [1577, 905, 1603, 960], 'S', 'S'),
  R('701', [1472, 765, 1552, 827], 'class', 'S', { doors: ['E'] }), N('Storage', [1463, 827, 1552, 848], 'storage', 'S', { doors: ['E'] }),
  R('702', [1472, 852, 1552, 905], 'class', 'S', { doors: ['E'] }),
  // ---------------- 900s (2021)
  N("Boys' Restroom", [1206, 911, 1236, 975], 'lav', 'N', { doors: ['S'] }), N("Girls' Restroom", [1236, 911, 1262, 948], 'lav', 'N', { doors: ['S'] }),
  R('904', [1262, 910, 1309, 975], 'class', 'N', { doors: ['S'] }), N('Storage', [1309, 910, 1329, 975], 'storage', 'N', { doors: ['S'] }),
  R('903', [1329, 910, 1374, 975], 'class', 'N', { doors: ['S'] }), R('902', [1374, 910, 1449, 975], 'class', 'N', { doors: ['S'] }),
  N('Storage', [1449, 910, 1470, 975], 'storage', 'N', { doors: ['S'] }), R('901', [1470, 910, 1549, 975], 'class', 'N', { doors: ['S'] }),
  ST('905', [1204, 1002, 1230, 1071], 'N', 'N'),
  R('905', [1230, 1002, 1290, 1064], 'class', 'N', { doors: ['N'] }), R('906', [1290, 1002, 1327, 1064], 'class', 'N', { doors: ['N'] }),
  R('907', [1327, 1002, 1364, 1064], 'class', 'N', { doors: ['N'] }), R('908', [1364, 1002, 1425, 1064], 'class', 'N', { doors: ['N'] }),
  R('909', [1425, 1002, 1502, 1064], 'class', 'N', { doors: ['N'] }), N('Storage', [1502, 1002, 1521, 1064], 'storage', 'N', { doors: ['N'] }),
  R('910', [1521, 1002, 1596, 1064], 'class', 'N', { doors: ['N'] }),
];

// Second floor, in the second-floor drawing's own pixels (mapped by F2M). The stairwells are
// the first floor's.
const F2 = [
  R('815', [1742, 672, 1812, 728], 'class', 'S', { doors: ['E:0.85'] }), R('812', [1740, 728, 1813, 792], 'class', 'S', { doors: ['E'] }),
  N('Storage', [1739, 792, 1813, 803], 'storage', 'S', { doors: ['E'] }),
  R('813', [1738, 803, 1813, 855], 'class', 'S', { doors: ['E'] }), R('814', [1738, 855, 1813, 892], 'class', 'S', { doors: ['E'] }),
  N("Boys' Restroom", [1737, 892, 1777, 912], 'lav', 'S', { doors: ['E'] }), N("Girls' Restroom", [1737, 912, 1777, 935], 'lav', 'S', { doors: ['E'] }),
  R('801', [1735, 935, 1810, 958], 'office', 'S', { doors: ['E'] }), R('802', [1734, 958, 1808, 990], 'class', 'S', { doors: ['E'] }),
  R('803', [1733, 990, 1807, 1018], 'class', 'S', { doors: ['E'] }), R('804', [1731, 1018, 1805, 1053], 'class', 'S', { doors: ['E'] }),
  R('805', [1728, 1053, 1803, 1102], 'class', 'S', { doors: ['E'] }),
  R('811', [1838, 728, 1913, 767], 'class', 'S', { doors: ['W'] }), R('810', [1838, 767, 1913, 817], 'class', 'S', { doors: ['W'] }),
  R('809', [1838, 817, 1932, 888], 'class', 'S', { doors: ['W'] }), R('808', [1835, 888, 1932, 947], 'class', 'S', { doors: ['W'] }),
  R('807', [1833, 947, 1910, 998], 'class', 'S', { doors: ['W'] }), R('806', [1830, 998, 1907, 1050], 'class', 'S', { doors: ['W'] }),
  N("Boys' Restroom", [1472, 1112, 1500, 1150], 'lav', 'N', { doors: ['S'] }), N("Girls' Restroom", [1500, 1112, 1528, 1150], 'lav', 'N', { doors: ['S'] }),
  R('1005', [1528, 1112, 1557, 1170], 'office', 'N', { doors: ['S'] }), R('1004', [1557, 1112, 1593, 1170], 'class', 'N', { doors: ['S'] }),
  N('Storage', [1593, 1112, 1612, 1170], 'storage', 'N', { doors: ['S'] }),
  R('1003', [1612, 1108, 1682, 1170], 'class', 'N', { doors: ['S'] }), R('1002', [1682, 1108, 1740, 1170], 'class', 'N', { doors: ['S'] }),
  R('1001', [1740, 1107, 1800, 1170], 'class', 'N', { doors: ['S'] }),
  N('Storage', [1495, 1200, 1517, 1272], 'storage', 'N', { doors: ['N'] }), R('1006', [1517, 1200, 1590, 1270], 'class', 'N', { doors: ['N'] }),
  N('Storage', [1590, 1200, 1607, 1270], 'storage', 'N', { doors: ['N'] }), R('1007', [1607, 1198, 1680, 1268], 'class', 'N', { doors: ['N'] }),
  R('1008', [1680, 1198, 1752, 1266], 'class', 'N', { doors: ['N'] }), N('Storage', [1752, 1198, 1770, 1265], 'storage', 'N', { doors: ['N'] }),
  R('1009', [1770, 1197, 1847, 1263], 'class', 'N', { doors: ['N'] }),
];

// ---------------------------------------------------------------------------------------
// Hallways: floor that belongs to no room (they may overlap rooms; rooms win).
// ---------------------------------------------------------------------------------------
const H = (r, wing, block) => ({ r, wing, block });
const HALLS1 = [
  // west wing
  H([165, 573, 342, 592], 'W'), H([172, 573, 200, 845], 'W'), H([342, 500, 410, 600], 'W'),
  H([262, 613, 367, 703], 'W'), H([257, 703, 330, 767], 'W'), H([193, 760, 257, 767], 'W'), H([172, 800, 193, 845], 'W'),
  H([78, 837, 380, 862], 'W'), H([367, 735, 505, 800], 'W'), H([367, 800, 505, 875], 'W'), H([373, 780, 380, 862], 'W'),
  H([410, 573, 758, 600], 'W'), H([517, 520, 533, 600], 'W'), H([192, 558, 212, 573], 'W'), H([740, 560, 758, 600], 'C'), H([505, 735, 753, 753], 'O'),
  // gym addition
  H([282, 862, 305, 1066], 'G'), H([303, 907, 377, 937], 'G'), H([303, 883, 373, 907], 'G'),
  // office
  H([580, 753, 597, 877], 'O'), H([542, 858, 562, 912], 'O'), H([580, 857, 735, 872], 'O'), H([590, 872, 607, 962], 'O'),
  H([580, 878, 590, 912], 'O'), H([735, 753, 753, 857], 'O'), H([607, 893, 637, 937], 'O'),
  // 400s, 8th Grade Concourse, 600s, 200s, 7th Grade Concourse
  H([858, 433, 1065, 502], 'C'), H([1083, 537, 1112, 577], 'C'), H([1085, 755, 1112, 800], 'C'), H([858, 482, 893, 498], 'C'), H([893, 502, 923, 577], 'C'), H([1000, 502, 1030, 577], 'C'),
  H([740, 577, 1188, 600], 'C'), H([840, 600, 857, 755], 'C'), H([1000, 600, 1030, 755], 'C'), H([857, 690, 1000, 693], 'C'),
  H([1030, 643, 1062, 693], 'C'), H([1062, 597, 1132, 615], 'C'), H([1132, 643, 1165, 683], 'C'), H([1062, 715, 1132, 733], 'C'),
  H([735, 733, 1190, 755], 'C'), H([892, 755, 922, 895], 'C'), H([1000, 755, 1030, 895], 'C'), H([892, 830, 1030, 895], 'C'),
  H([855, 838, 892, 853], 'C'), H([855, 887, 892, 895], 'C'), H([1030, 838, 1065, 850], 'C'), H([1030, 877, 1133, 887], 'C'),
  H([988, 895, 1008, 1002], 'C'), H([1165, 493, 1188, 600], 'C'), H([1170, 728, 1190, 1002], 'C'), H([1130, 838, 1170, 850], 'C'),
  H([1170, 1002, 1204, 1071], 'N'),
  // 300s, 6th Grade Concourse
  H([1188, 575, 1293, 600], 'E'), H([1293, 560, 1462, 600], 'E'), H([1227, 600, 1330, 633], 'E'), H([1227, 648, 1330, 683], 'E'),
  H([1227, 697, 1330, 752], 'E'), H([1277, 600, 1330, 752], 'E'), H([1330, 653, 1355, 678], 'E'), H([1330, 698, 1355, 752], 'E'),
  H([1423, 600, 1462, 743], 'E'), H([1190, 728, 1462, 752], 'E'), H([1340, 743, 1462, 767], 'E'), H([1293, 752, 1305, 767], 'E'),
  // annex
  H([1175, 343, 1422, 368], 'A'), H([1175, 335, 1203, 452], 'A'), H([1250, 365, 1268, 393], 'A'), H([1352, 365, 1378, 393], 'A'),
  H([1175, 452, 1205, 512], 'A'),
  // 700s
  H([1473, 560, 1553, 583], 'S'), H([1552, 498, 1605, 518], 'S'), H([1552, 500, 1580, 1002], 'S'), H([1578, 612, 1602, 653], 'S'), H([1578, 708, 1602, 752], 'S'),
  H([1473, 735, 1552, 765], 'S'), H([1517, 688, 1552, 722], 'S'), H([1517, 688, 1530, 737], 'S'), H([1577, 852, 1603, 905], 'S'), H([1552, 848, 1577, 905], 'S'),
  // 900s
  H([1206, 975, 1603, 1002], 'N'), H([1222, 945, 1262, 976], 'N'), H([1549, 905, 1603, 976], 'N'), H([1577, 960, 1603, 1002], 'N'),
];
const HALLS2 = [
  H([1812, 672, 1838, 1110], 'S'), H([1812, 672, 1870, 728], 'S'), H([1800, 1050, 1835, 1200], 'S'),
  H([1470, 1168, 1850, 1200], 'N'), H([1472, 1150, 1528, 1170], 'N'), H([1777, 892, 1812, 935], 'S'),
];

// ---------------------------------------------------------------------------------------
// Massing blocks: footprint, floors, ceiling and roof heights. Each room and hallway belongs
// to its wing's block unless listed in ROOM_BLOCK. Roof heights are measured: the one-story
// roof decks sit at 4.1-4.3 m in the LiDAR, the 700s wing's at 8.6 m, and the new gym's
// metal fascia tops out at about 9.1 m in the architect's photo (7 ft doors as the ruler).
// ---------------------------------------------------------------------------------------
export const BLOCKS = [
  { id: 'one', name: 'Hallway', levels: 1, ceil: CEIL, roof: 4.2, mansard: true },
  { id: 'aux', name: 'Auxiliary Gym', levels: 1, ceil: 6.4, roof: 7.0, mansard: true, windows: false },
  { id: 'fit', name: 'Fitness Center', levels: 1, ceil: 4.6, roof: 5.4, mansard: true },
  { id: 'aud', name: 'Auditorium', levels: 1, ceil: 7.0, roof: 8.0, mansard: true, windows: false },
  { id: 'gym', name: 'Gym', levels: 1, ceil: 7.6, roof: 8.6, fascia: true, windows: false, style: 'new' },
  { id: 'new1', name: 'Hallway', levels: 1, ceil: CEIL, roof: 4.5, fascia: true, style: 'new' },
  { id: 'mc', name: 'Media Center', levels: 1, ceil: 4.6, roof: 5.8, fascia: true, style: 'new' },
  { id: 'w700', name: '700s', levels: 2, roof: 8.6, mansard: true },
  { id: 'w900', name: '900s', levels: 2, roof: 9.0, fascia: true, style: 'new' },
];
const WING_BLOCK = { W: 'one', G: 'new1', O: 'new1', C: 'one', M: 'mc', E: 'one', A: 'one', S: 'w700', N: 'w900' };
const ROOM_BLOCK = { 'Auxiliary Gym': 'aux', Auditorium: 'aud', Gym: 'gym', 'Fitness Center': 'fit' };

// ---------------------------------------------------------------------------------------
// Assemble: apply the wing fits, snap the second floor into its wing, find the doors.
// ---------------------------------------------------------------------------------------
const inR = (r, x, y, m = 0) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
function subtract(rects, hole) {
  const out = [];
  for (const a of rects) {
    if (hole[2] <= a[0] || hole[0] >= a[2] || hole[3] <= a[1] || hole[1] >= a[3]) { out.push(a); continue; }
    if (hole[1] > a[1]) out.push([a[0], a[1], a[2], hole[1]]);
    if (hole[3] < a[3]) out.push([a[0], hole[3], a[2], a[3]]);
    const y0 = Math.max(a[1], hole[1]), y1 = Math.min(a[3], hole[3]);
    if (hole[0] > a[0]) out.push([a[0], y0, hole[0], y1]);
    if (hole[2] < a[2]) out.push([hole[2], y0, a[2], y1]);
  }
  return out.filter((r) => r[2] - r[0] > 1e-6 && r[3] - r[1] > 1e-6);
}

// The handout draws neighboring rooms a hair apart in places. Close any gap of up to GAP plan
// units between a room and the room or hallway beside it by moving the room's edge over.
const GAP = 7;
function closeGaps(rooms, halls) {
  const all = [...rooms.map((r) => r.r), ...halls.map((h) => h.r)];
  const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
  for (const rm of rooms) {
    const r = rm.r;
    for (const side of [0, 1, 2, 3]) {
      const horiz = side === 1 || side === 3; // edges at y
      let best = null;
      for (const o of all) {
        if (o === r) continue;
        if (horiz ? !overlap(r[0], r[2], o[0], o[2]) : !overlap(r[1], r[3], o[1], o[3])) continue;
        // inside overlap along this axis means no gap
        const gap = side === 0 ? r[0] - o[2] : side === 1 ? r[1] - o[3] : side === 2 ? o[0] - r[2] : o[1] - r[3];
        if (gap > 0.01 && gap <= GAP && (best === null || gap < best.gap)) best = { gap, v: side === 0 ? o[2] : side === 1 ? o[3] : side === 2 ? o[0] : o[1] };
      }
      if (best) r[side] = best.v;
    }
  }
}
const rooms1 = F1.map((rm) => ({ ...rm, r: fixRect(rm.r, rm.wing) }));
const halls1 = HALLS1.map((h) => ({ ...h, r: fixRect(h.r, h.wing) }));
closeGaps(rooms1, halls1);
const blockOf = (it) => it.block || ROOM_BLOCK[it.name] || WING_BLOCK[it.wing];
{
  const claimed = [];
  const order = ['gym', 'aud', 'aux', 'fit', 'mc', 'w700', 'w900', 'new1', 'one'];
  for (const id of order) {
    const b = BLOCKS.find((bb) => bb.id === id);
    const rects = [];
    for (const it of [...rooms1, ...halls1]) {
      if (blockOf(it) !== id) continue;
      let pieces = [it.r];
      for (const c of [...claimed, ...rects]) pieces = subtract(pieces, c);
      rects.push(...pieces);
    }
    b.rects = rects;
    claimed.push(...rects);
  }
}
// level-1 footprint: the two-story blocks
export const LEVEL1_RECTS = BLOCKS.filter((b) => b.levels === 2).flatMap((b) => b.rects);
const L1x = [...new Set(LEVEL1_RECTS.flatMap((r) => [r[0], r[2]]))], L1y = [...new Set(LEVEL1_RECTS.flatMap((r) => [r[1], r[3]]))];
const snap = (v, list, tol = 7) => { let best = v, bd = tol; for (const c of list) if (Math.abs(c - v) < bd) { bd = Math.abs(c - v); best = c; } return best; };
const toL1 = (r, wing) => {
  const q = fixRect(f2Rect(r), wing);
  return [snap(q[0], L1x), snap(q[1], L1y), snap(q[2], L1x), snap(q[3], L1y)];
};
const rooms2 = F2.map((rm) => ({ ...rm, r: toL1(rm.r, rm.wing) }));
const halls2 = HALLS2.map((h) => ({ ...h, r: toL1(h.r, h.wing) }));
closeGaps(rooms2, halls2);
for (const st of rooms1.filter((r) => r.type === 'stair')) rooms2.push({ ...st, r: [...st.r] });

function isHall(lv, x, y) {
  const halls = lv ? halls2 : halls1, rms = lv ? rooms2 : rooms1;
  return halls.some((h) => inR(h.r, x, y)) && !rms.some((rm) => inR(rm.r, x, y, -0.01));
}
// automatic doors: one door, centered on the longest stretch of hallway along any side
function autoDoors(rm, lv) {
  if (rm.doors) return rm.doors;
  const [x0, y0, x1, y1] = rm.r;
  const best = { len: 0 };
  const sides = { N: [x0, x1, y0 - 2, 'x'], S: [x0, x1, y1 + 2, 'x'], W: [y0, y1, x0 - 2, 'y'], E: [y0, y1, x1 + 2, 'y'] };
  for (const [side, [a, b, c, ax]] of Object.entries(sides)) {
    let start = null, bestRun = 0, bestMid = 0;
    const n = Math.max(4, Math.round((b - a) / 2));
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const ok = ax === 'x' ? isHall(lv, t, c) : isHall(lv, c, t);
      if (ok) {
        if (start === null) start = t;
        if (t - start > bestRun) { bestRun = t - start; bestMid = (start + t) / 2; }
      } else start = null;
    }
    if (bestRun > best.len) Object.assign(best, { len: bestRun, side, frac: (bestMid - a) / (b - a) });
  }
  if (!best.side) return [];
  const f = Math.min(0.85, Math.max(0.15, best.frac));
  return [`${best.side}:${f.toFixed(2)}`];
}
for (const rm of rooms1) rm.doors = autoDoors(rm, 0);
for (const rm of rooms2) rm.doors = autoDoors(rm, 1);

export const ROOMS = [rooms1, rooms2];
export const HALLS = [halls1.map((h) => h.r), halls2.map((h) => h.r)];

// Courtyards: open to the sky, outside every block
export const COURTYARDS = [[1190, 817, 1462, 910], [1012, 936, 1168, 1002]];
export const COURTYARD = COURTYARDS[0];

// Auditorium: the house slopes down from the back (west) toward the stage at the east end
const AUD = rooms1.find((r) => r.name === 'Auditorium').r;
export const THEATRE = { r: AUD, back: 560, rake: 655, front: 682, depth: -1.1, stage: [690, AUD[1], AUD[2], AUD[3]] };

// Named hallway zones for the location readout (first match wins)
export const ZONES = [
  { name: 'Lobby', level: 0, r: [367, 735, 505, 875] },
  { name: 'Extended Commons', level: 0, r: [262, 613, 367, 703] },
  { name: 'Fitness Hallway', level: 0, r: [165, 573, 200, 845] },
  { name: '8th Grade Concourse', level: 0, r: [858, 433, 1065, 577] },
  { name: '7th Grade Concourse', level: 0, r: [892, 755, 1030, 895] },
  { name: '6th Grade Concourse', level: 0, r: [1227, 600, 1355, 750] },
  { name: '6th Grade Annex', level: 0, r: fixRect([1175, 281, 1422, 512], 'A') },
  { name: '700s Hallway', level: 0, r: fixRect([1473, 460, 1603, 1002], 'S') },
  { name: '800s Hallway', level: 1, r: fixRect([1473, 460, 1682, 905], 'S') },
  { name: '900s Hallway', level: 0, r: [1170, 905, 1603, 1071] },
  { name: '1000s Hallway', level: 1, r: [1170, 905, 1603, 1071] },
  { name: '300s Hallway', level: 0, r: [1165, 493, 1462, 830] },
  { name: '600s Hallway', level: 0, r: [735, 577, 1190, 755] },
  { name: '200s Hallway', level: 0, r: [735, 733, 1190, 1002] },
  { name: '400s Hallway', level: 0, r: [740, 375, 1190, 600] },
  { name: '100s Hallway', level: 0, r: [500, 735, 760, 962] },
  { name: 'Gym Hallway', level: 0, r: [78, 837, 380, 1066] },
  { name: '500s Hallway', level: 0, r: [342, 480, 760, 600] },
];

// Exterior doors. dir = outward normal; at = a point on the exterior wall (plan units)
export const ENTRANCES = [
  { at: [437, 875], dir: 'S', w: 16.5, main: true, name: 'Main Entrance' },
  { at: [78, 850], dir: 'W', w: 2.0, name: 'West Exit' },
  { at: [138, 1066], dir: 'S', w: 1.8, name: 'Gym Doors' },
  { at: [242, 1066], dir: 'S', w: 1.8, name: 'Gym Doors' },
  { at: [375, 500], dir: 'N', w: 2.0, name: 'North Exit' },
  { at: [1008, 975], dir: 'E', w: 1.6, name: 'Courtyard Door' },
  { at: [1422, 355], dir: 'E', w: 2.0, name: 'Annex Exit', wing: 'A' },
  { at: [1605, 509], dir: 'E', w: 1.8, name: 'Blue Stairs Exit', wing: 'S' },
  { at: [1603, 985], dir: 'E', w: 2.0, name: '900s Exit' },
  { at: [1190, 870], dir: 'E', w: 2.0, name: 'Courtyard Doors' },
  { at: [1204, 1040], dir: 'W', w: 1.8, name: 'Media Center Doors' },
];
for (const e of ENTRANCES) if (e.wing) e.at = fixPt(e.at[0], e.at[1], e.wing);
