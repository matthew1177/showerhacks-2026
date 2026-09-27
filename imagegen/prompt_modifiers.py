"""Small visual jokes selected once per image and saved for the game's reveal."""

import random

LITERAL_SUFFIX = ", literal depiction, single clear subject, simple composition, plain background"

# Draw from different categories when combining jokes so we never ask for two
# competing materials or two different locations in the same image.
MODIFIERS = {
    "accessory": (
        "the main subject wears enormous roller skates",
        "the main subject wears a tiny party hat",
        "the main subject wears oversized heart-shaped sunglasses",
        "the main subject wears an inflatable swim ring",
        "the main subject sports a magnificent curly moustache",
        "the main subject wears a crown made of spaghetti",
        "the main subject wears a traffic cone as a hat",
        "the main subject wears a cape made of a picnic blanket",
        "the main subject wears gigantic fuzzy bunny slippers",
        "the main subject wears a necktie that drags along the ground",
        "the main subject wears a necklace of rubber ducks",
        "the main subject wears a helmet with a tiny spinning propeller",
    ),
    "material": (
        "everything is made of wobbly jelly",
        "everything looks like inflatable pool toys",
        "everything is knitted from chunky wool",
        "everything is made of folded cardboard",
        "everything is made of marshmallows",
        "everything looks like squeaky rubber bath toys",
        "everything is sculpted from mashed potatoes",
        "everything is made of shiny crumpled aluminium foil",
        "everything is built from gingerbread and icing",
        "everything is made of colorful pipe cleaners",
        "everything is made of stacked cheese cubes",
        "everything is made of bouncy soap bubbles",
    ),
    "setting": (
        "the scene takes place inside a giant teacup",
        "the scene is on a tiny theater stage with velvet curtains",
        "the scene is inside a snow globe",
        "the scene is on a floating slice of pizza",
        "the scene is in a ball pit",
        "the scene is inside an enormous cereal bowl",
        "the scene is on top of a giant birthday cake",
        "the scene is inside a claw machine",
        "the scene is in a supermarket run by penguins",
        "the scene is on a tiny island made of waffles",
        "the scene is in a disco with a giant broccoli mirror ball",
        "the scene is inside a dollhouse with floral wallpaper",
    ),
    "proportions": (
        "the main subject is smaller than a teaspoon",
        "the main subject towers over miniature buildings",
        "the main subject is as flat as a pancake",
        "the main subject is stretched tall like a pool noodle",
        "the main subject is perfectly round like a beach ball",
        "the main subject has a comically oversized head",
        "the main subject has tiny legs and enormous feet",
        "the main subject balances on absurdly long stilt legs",
        "the main subject has huge googly eyes",
        "the main subject has an enormous curly tail",
        "every piece of furniture is comically tiny",
        "ordinary objects in the background are the size of skyscrapers",
    ),
    "onlookers": (
        "a very serious audience of rubber ducks watches the scene",
        "three pigeons in business suits inspect the scene",
        "a tiny marching band of frogs parades in the background",
        "a potato with googly eyes peeks around a corner",
        "a snail wearing a referee shirt watches closely",
        "a crowd of garden gnomes applauds enthusiastically",
        "a raccoon in a tuxedo serves snacks in the background",
        "a squirrel film crew records the scene",
        "a very unimpressed goose stands in the foreground",
        "a row of penguins in sunglasses acts as security",
        "a tiny dinosaur holds an oversized umbrella over the scene",
        "a lobster with a clipboard supervises everything",
    ),
}


def select_modifiers(creativity: int, rng=random) -> list[str]:
    count = 0 if creativity < 63 else 1 if creativity < 88 else 2
    categories = rng.sample(list(MODIFIERS), count)
    return [rng.choice(MODIFIERS[category]) for category in categories]


def compose_prompt(prompt: str, creativity: int, modifiers: list[str]) -> str:
    if creativity < 35:
        return prompt + LITERAL_SUFFIX
    if not modifiers:
        return prompt
    return prompt + ". Keep the main subject and action recognizable. " + ". ".join(modifiers) + "."
