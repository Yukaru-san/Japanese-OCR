package com.yukarusan.japaneseocr;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ExifOrientationTest {

    /** Where the corners of a 2x1 image (top-left, top-right) end up after turning and mirroring it. */
    private static String corners(int orientation) {
        // Image points: top-left (0,0), top-right (2,0), bottom-left (0,1)
        int[][] points = { { 0, 0 }, { 2, 0 }, { 0, 1 } };
        StringBuilder result = new StringBuilder();
        for (int[] point : points) {
            int x = point[0],
                y = point[1];
            for (int turn = 0; turn < ExifOrientation.degrees(orientation) / 90; turn++) {
                int turned = -y;
                y = x;
                x = turned;
            }
            if (ExifOrientation.isMirrored(orientation)) x = -x;
            result.append(x).append(',').append(y).append(' ');
        }
        return result.toString().trim();
    }

    @Test
    public void everyOrientationHasItsOwnTransform() {
        // The eight EXIF orientations: identity, the three turns and the four mirrorings
        assertEquals("0,0 2,0 0,1", corners(1));
        assertEquals("0,0 -2,0 0,1", corners(2));
        assertEquals("0,0 -2,0 0,-1", corners(3));
        assertEquals("0,0 2,0 0,-1", corners(4));
        assertEquals("0,0 0,2 1,0", corners(5));
        assertEquals("0,0 0,2 -1,0", corners(6));
        assertEquals("0,0 0,-2 -1,0", corners(7));
        assertEquals("0,0 0,-2 1,0", corners(8));
    }
}
