import random
import unittest

from prompt_modifiers import LITERAL_SUFFIX, MODIFIERS, compose_prompt, select_modifiers


class PromptModifiersTest(unittest.TestCase):
    def test_creativity_boundaries_match_the_number_of_jokes_promised(self):
        for creativity, count in ((0, 0), (34, 0), (35, 0), (50, 0), (62, 0), (63, 1), (87, 1), (88, 2), (100, 2)):
            with self.subTest(creativity=creativity):
                self.assertEqual(len(select_modifiers(creativity, random.Random(0))), count)

    def test_combinations_are_varied_and_never_use_competing_categories(self):
        categories = {modifier: category for category, options in MODIFIERS.items() for modifier in options}
        rng = random.Random(42)
        seen = set()
        for _ in range(200):
            modifiers = select_modifiers(90, rng)
            self.assertEqual(len({categories[modifier] for modifier in modifiers}), 2)
            seen.update(modifiers)
        self.assertEqual(seen, set(categories))

    def test_literal_and_balanced_do_not_add_silly_modifiers(self):
        prompt = "a cat running a bakery"
        self.assertEqual(compose_prompt(prompt, 20, select_modifiers(20)), prompt + LITERAL_SUFFIX)
        self.assertEqual(compose_prompt(prompt, 50, select_modifiers(50)), prompt)

    def test_prompt_keeps_the_players_words_and_each_selected_modifier(self):
        prompt = "a cat running a bakery"
        modifiers = select_modifiers(90, random.Random(7))
        text = compose_prompt(prompt, 90, modifiers)
        self.assertTrue(text.startswith(prompt + "."))
        for modifier in modifiers:
            self.assertEqual(text.count(modifier), 1)
        self.assertIn("Keep the main subject and action recognizable", text)


if __name__ == "__main__":
    unittest.main()
