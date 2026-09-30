/** MediaPipe face-mesh landmark indices used for alignment, colour sampling and expressions. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109,
];
/** Inner lip ring: triangles made only of these vertices form the mouth cavity. */
export const INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
/** Person's right eye (image left) and left eye (image right). */
export const EYE_R = { outer: 33, inner: 133, upper: [246, 161, 160, 159, 158, 157, 173], lower: [7, 163, 144, 145, 153, 154, 155] };
export const EYE_L = { outer: 263, inner: 362, upper: [466, 388, 387, 386, 385, 384, 398], lower: [249, 390, 373, 374, 380, 381, 382] };
export const BROW_R = { inner: [55, 65, 107, 66], outer: [52, 53, 46, 70, 63, 105] };
export const BROW_L = { inner: [285, 295, 336, 296], outer: [282, 283, 276, 300, 293, 334] };
export const MOUTH = { upperInner: 13, lowerInner: 14, cornerR: 61, cornerL: 291, chin: 152 };
export const NOSE_TIP = 1;
export const FOREHEAD = 151;
export const CHEEKS = [50, 280, 101, 330, 205, 425];
