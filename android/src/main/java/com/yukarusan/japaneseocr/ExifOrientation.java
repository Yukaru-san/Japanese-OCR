package com.yukarusan.japaneseocr;

import android.media.ExifInterface;

/**
 * The turn and mirroring an EXIF orientation (1 to 8) asks for, applied in this order to show the
 * image upright. Plain values, so the mapping is testable without a device.
 */
final class ExifOrientation {

    private ExifOrientation() {}

    /** Clockwise rotation, applied first. */
    static int degrees(int orientation) {
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
            case ExifInterface.ORIENTATION_TRANSPOSE:
                return 90;
            case ExifInterface.ORIENTATION_ROTATE_180:
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                return 180;
            case ExifInterface.ORIENTATION_ROTATE_270:
            case ExifInterface.ORIENTATION_TRANSVERSE:
                return 270;
            default:
                return 0;
        }
    }

    /** True if the rotated image is then mirrored left to right. */
    static boolean isMirrored(int orientation) {
        return (
            orientation == ExifInterface.ORIENTATION_FLIP_HORIZONTAL ||
            orientation == ExifInterface.ORIENTATION_FLIP_VERTICAL ||
            orientation == ExifInterface.ORIENTATION_TRANSPOSE ||
            orientation == ExifInterface.ORIENTATION_TRANSVERSE
        );
    }
}
