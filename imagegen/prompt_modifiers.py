"""Gentle art directions selected once per image and saved for the reveal."""

import random

LITERAL_SUFFIX = ", literal depiction, single clear subject, simple composition, plain background"

# Any can explore different media. An explicit art style stays within its own
# family instead of being overwritten by an incompatible random medium.
STYLE_VARIATIONS = {
    "Any": (
        "soft watercolor washes with restrained ink outlines",
        "warm colored-pencil illustration on lightly textured paper",
        "delicate pen-and-ink illustration with a gentle color wash",
        "matte gouache illustration with softly simplified shapes",
        "soft pastel illustration with blended edges",
        "hand-printed linocut illustration with fine carved lines",
        "subtle risograph illustration with lightly offset printed colors",
        "layered paper-cut illustration with shallow paper shadows",
        "gently stylized 3D illustration with matte surfaces",
        "soft analog photography with subtle film grain",
        "loose graphite illustration with a few restrained color accents",
        "vintage picture-book illustration with delicate painted details",
    ),
    "Photo": (
        "candid 35mm photography with subtle film grain",
        "medium-format editorial photography with natural detail",
        "soft analog photography with a gently faded finish",
        "polished magazine photography with understated color grading",
        "vintage instant photography with softly rendered detail",
        "documentary photography with natural, unpolished textures",
    ),
    "Cartoon": (
        "hand-drawn storybook cartoon with delicate linework",
        "clean editorial cartoon with gently rounded shapes",
        "vintage newspaper cartoon with expressive ink lines",
        "soft animated-film illustration with subtle shading",
        "simple comic-book illustration with flat color blocks",
        "hand-inked cartoon with slightly irregular outlines",
    ),
    "Pixel art": (
        "hand-placed chunky pixels with crisp silhouettes",
        "retro adventure-game pixel art with delicate dithering",
        "16-bit pixel art with soft stepped shading",
        "clean low-resolution pixel art with restrained detail",
        "small-palette pixel art with carefully placed highlights",
        "classic arcade pixel art with tidy block shapes",
    ),
    "Oil painting": (
        "loose impressionist oil painting with gentle brush marks",
        "delicate oil study with fine brushwork",
        "thin oil glazes with softly luminous layers",
        "soft-edged oil painting with understated canvas texture",
        "textured oil painting with modest impasto",
        "classical oil painting with smoothly blended tones",
    ),
    "Claymation": (
        "handmade stop-motion clay with faint fingerprints",
        "smooth plasticine stop-motion with clean sculpted details",
        "miniature clay animation with simple handcrafted forms",
        "matte clay figures with delicate tool marks",
        "softly rounded clay animation with subtle surface texture",
        "clay stop-motion with small visible modeling seams",
    ),
}

# At the highest level, add one compatible presentation detail. No new objects,
# costumes, locations, altered anatomy, or changes to what the subject is doing.
ACCENTS = {
    "lighting": (
        "soft overcast light with gentle shadows",
        "warm late-afternoon light",
        "gentle backlighting with a faint rim of light",
        "soft dappled light across the scene",
        "cool early-morning light",
        "soft diffused side lighting",
    ),
    "palette": (
        "a warm earthy color palette",
        "cool muted colors with restrained contrast",
        "a soft dusty-pastel palette",
        "restrained jewel tones with gentle highlights",
        "two dominant complementary colors with subtle accents",
        "lightly desaturated colors with one warmer accent",
    ),
    "composition": (
        "a slightly off-center subject with comfortable negative space",
        "a slightly lower viewpoint while keeping the scene readable",
        "a gentle three-quarter view with natural proportions",
        "a little more breathing room around the main subject",
        "closer framing that still shows the main subject and action",
        "a slightly elevated viewpoint with clear foreground separation",
    ),
}


class ModifierPicker:
    """Shuffle each pool before reuse; the image worker calls this serially."""

    def __init__(self, rng=random):
        self.rng = rng
        self.bags = {}
        self.last = {}

    def draw(self, key, choices):
        bag = self.bags.setdefault(key, [])
        if not bag:
            bag.extend(self.rng.sample(list(choices), len(choices)))
            # Also avoid an immediate repeat at the boundary between two bags.
            if len(bag) > 1 and bag[-1] == self.last.get(key):
                bag[0], bag[-1] = bag[-1], bag[0]
        value = bag.pop()
        self.last[key] = value
        return value

    def select(self, creativity: int, style: str = "Any") -> list[str]:
        if creativity < 63:
            return []
        style = style if style in STYLE_VARIATIONS else "Any"
        modifiers = [self.draw(("style", style), STYLE_VARIATIONS[style])]
        if creativity >= 88:
            category = self.draw("accent-category", ACCENTS)
            modifiers.append(self.draw(("accent", category), ACCENTS[category]))
        return modifiers


_picker = ModifierPicker()


def select_modifiers(creativity: int, style: str = "Any") -> list[str]:
    return _picker.select(creativity, style)


def compose_prompt(prompt: str, creativity: int, modifiers: list[str]) -> str:
    if creativity < 35:
        return prompt + LITERAL_SUFFIX
    if not modifiers:
        return prompt
    return (prompt + ". Keep the subject, action, setting and proportions unchanged. "
            "Vary only the visual presentation: " + "; ".join(modifiers) + ".")
