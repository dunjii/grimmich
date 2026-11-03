"""Face cut-outs from the large picture: size, cache, picture that does not fit the face box."""
import os
import shutil
import tempfile
import unittest

import cv2
import numpy as np

import face_crops


class FaceCropsTest(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.dir = tempfile.mkdtemp()
        os.chdir(self.dir)
        open("immich.env", "w").close()
        self.calls = 0
        self.size = (2000, 3000)   # width, height of the "large picture"
        face_crops._asset_id = lambda key: "ASSET"
        face_crops._load_big = self._big

    def tearDown(self):
        os.chdir(self.old)
        shutil.rmtree(self.dir, ignore_errors=True)

    def _big(self, asset_id):
        self.calls += 1
        w, h = self.size
        return np.full((h, w, 3), 128, np.uint8)

    def test_cut_out_is_made_once_and_kept(self):
        data = face_crops.crop("K_abc123", 1000, 1500, 100, 200, 200)   # box coordinates of a 1000 x 1500 picture
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(img.shape[:2], (400, 400))     # 200 box units are 400 pixels in the 2000 px wide picture
        self.assertEqual(face_crops.crop("K_abc123", 1000, 1500, 100, 200, 200), data)
        self.assertEqual(self.calls, 1)

    def test_large_cut_out_is_scaled_down(self):
        data = face_crops.crop("K_abc123", 1000, 1500, 0, 0, 1000)
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(img.shape[:2], (face_crops.MAX_SIDE, face_crops.MAX_SIDE))

    def test_picture_that_does_not_fit_gives_nothing(self):
        self.size = (3000, 2000)                       # turned: the face box would not fit
        self.assertIsNone(face_crops.crop("K_abc123", 1000, 1500, 100, 200, 200))
        self.assertIsNone(face_crops.crop("K_abc123", 1000, 1500, 100, 200, 200))
        self.assertEqual(self.calls, 1)                # the second time nothing is fetched again

    def test_impossible_numbers(self):
        self.assertIsNone(face_crops.crop("K_abc123", 1000, 1500, 900, 200, 400))
        self.assertIsNone(face_crops.crop("K_abc123", 1000, 1500, -5, 0, 100))
        self.assertEqual(self.calls, 0)


if __name__ == "__main__":
    unittest.main()
