"""Trivial helper used by echo-with-helper/recipe.py.

Exists specifically to prove that a recipe's relative imports resolve once
the executor dynamically imports the recipe module (Task 9).
"""


def shout(message: str) -> str:
    return message.upper() + "!"
