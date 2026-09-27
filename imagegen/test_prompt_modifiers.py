import random
import unittest

from prompt_modifiers import ACCENTS, LITERAL_SUFFIX, STYLE_VARIATIONS, ModifierPicker, compose_prompt


class PromptModifiersTest(unittest.TestCase):
    def test_creativity_boundaries_match_the_number_of_directions(self):
        picker = ModifierPicker(random.Random(0))
        for creativity, count in ((0, 0), (34, 0), (35, 0), (50, 0), (62, 0), (63, 1), (87, 1), (88, 2), (100, 2)):
            with self.subTest(creativity=creativity):
                self.assertEqual(len(picker.select(creativity)), count)

    def test_each_style_stays_in_its_family_and_exhausts_its_pool_before_repeating(self):
        picker = ModifierPicker(random.Random(42))
        for style, choices in STYLE_VARIATIONS.items():
            with self.subTest(style=style):
                draws = [picker.select(75, style)[0] for _ in range(len(choices) * 20)]
                for start in range(0, len(draws), len(choices)):
                    self.assertEqual(set(draws[start:start + len(choices)]), set(choices))
                self.assertTrue(all(a != b for a, b in zip(draws, draws[1:])))

    def test_high_creativity_pairs_one_style_with_a_varied_accent(self):
        picker = ModifierPicker(random.Random(7))
        category_for = {accent: category for category, choices in ACCENTS.items() for accent in choices}
        accents = {category: [] for category in ACCENTS}
        categories = []
        for _ in range(54):
            style, accent = picker.select(90)
            self.assertIn(style, STYLE_VARIATIONS["Any"])
            category = category_for[accent]
            categories.append(category)
            accents[category].append(accent)
        for start in range(0, len(categories), len(ACCENTS)):
            self.assertEqual(set(categories[start:start + len(ACCENTS)]), set(ACCENTS))
        self.assertTrue(all(a != b for a, b in zip(categories, categories[1:])))
        for category, draws in accents.items():
            choices = ACCENTS[category]
            for start in range(0, len(draws), len(choices)):
                self.assertEqual(set(draws[start:start + len(choices)]), set(choices))
            self.assertTrue(all(a != b for a, b in zip(draws, draws[1:])))

    def test_literal_and_balanced_leave_the_modifier_rotation_untouched(self):
        picker = ModifierPicker(random.Random(1))
        fresh_picker = ModifierPicker(random.Random(1))
        prompt = "a cat running a bakery"
        self.assertEqual(compose_prompt(prompt, 20, picker.select(20)), prompt + LITERAL_SUFFIX)
        self.assertEqual(compose_prompt(prompt, 50, picker.select(50)), prompt)
        self.assertEqual(picker.select(90), fresh_picker.select(90))

    def test_different_style_pools_keep_their_own_place(self):
        picker = ModifierPicker(random.Random(17))
        photos = [picker.select(75, "Photo")[0]]
        for _ in range(len(STYLE_VARIATIONS["Photo"]) - 1):
            picker.select(90, "Cartoon")
            photos.append(picker.select(75, "Photo")[0])
        self.assertEqual(set(photos), set(STYLE_VARIATIONS["Photo"]))

    def test_prompt_preserves_the_players_scene_and_each_selected_direction(self):
        prompt = "a cat running a bakery"
        modifiers = ModifierPicker(random.Random(7)).select(90)
        text = compose_prompt(prompt, 90, modifiers)
        self.assertTrue(text.startswith(prompt + "."))
        for modifier in modifiers:
            self.assertEqual(text.count(modifier), 1)
        self.assertIn("Keep the subject, action, setting and proportions unchanged", text)


if __name__ == "__main__":
    unittest.main()
