"""Echo with helper — like echo, but calls into a sibling helpers.py.

Exists specifically to prove that a recipe's relative import of a sibling
helper file (`from .helpers import ...`) resolves correctly once the executor
dynamically imports the recipe module (Task 9). Every real content recipe with
more than one file depends on this working.
"""

from pydantic import Field

from skillet.recipe import Params as BaseParams
from skillet.recipe import RecipeContext

from .helpers import shout


class Params(BaseParams):
    message: str = Field(..., min_length=1, description="The message to echo back, shouted.")


async def run(params: Params, ctx: RecipeContext) -> None:
    await ctx.emit.step("echo", "Shouting message", status="start")
    await ctx.emit.step("echo", "Shouting message", status="finish")
    await ctx.emit.result({"message": shout(params.message)})
