import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("install_mivolo", os.path.join(HERE, "..", "docker", "install_mivolo.py"))
install = importlib.util.module_from_spec(spec)
spec.loader.exec_module(install)

CREATE = "import timm\nfrom timm.models._helpers import load_state_dict, remap_checkpoint\nfrom timm.models._hub import load_model_config_from_hf\nfrom timm.models._pretrained import PretrainedCfg, split_model_name_tag\n"
MODEL = ("class MiVOLOModel(VOLO):\n    def __init__(self, layers, " + ", ".join(install.VOLO_PARAMETERS[1:]) + "):\n        super().__init__(\n"
         + "".join("            %s,\n" % n for n in install.VOLO_PARAMETERS) + "        )\n        self.x = 1\n")


class TestInstallMivolo(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, "mivolo", "model"))
        for name, text in (("create_timm_model.py", CREATE), ("mivolo_model.py", MODEL)):
            with open(os.path.join(self.root, "mivolo", "model", name), "w") as f:
                f.write(text)

    def read(self, name):
        with open(os.path.join(self.root, "mivolo", "model", name)) as f:
            return f.read()

    def test_patch_adapts_the_files_and_keeps_valid_python(self):
        self.assertEqual(sorted(install.patch(self.root)), ["create_timm_model.py", "mivolo_model.py"])
        for name in ("create_timm_model.py", "mivolo_model.py"):
            compile(self.read(name), name, "exec")
        self.assertIn("norm_layer=norm_layer,", self.read("mivolo_model.py"))
        self.assertIn("post_layers=post_layers,", self.read("mivolo_model.py"))
        self.assertIn("self.x = 1", self.read("mivolo_model.py"))   # the rest of the file is untouched
        self.assertIn("from timm.models._registry import split_model_name_tag", self.read("create_timm_model.py"))
        self.assertIn("remap_state_dict as remap_checkpoint", self.read("create_timm_model.py"))

    def test_a_second_run_changes_nothing(self):
        install.patch(self.root)
        before = (self.read("create_timm_model.py"), self.read("mivolo_model.py"))
        self.assertEqual(install.patch(self.root), [])
        self.assertEqual(before, (self.read("create_timm_model.py"), self.read("mivolo_model.py")))


if __name__ == "__main__":
    unittest.main()
