"""Echo — repeats back whatever message you send it.

A minimal fixture recipe used by the recipe-framework test suite. No external
dependencies, no declared env vars, no helper files — the trivial path.
"""

from pydantic import Field

from skillet.recipe import Params as BaseParams
from skillet.recipe import RecipeContext


class Params(BaseParams):
    message: str = Field(..., min_length=1, description="The message to echo back.")


async def run(params: Params, ctx: RecipeContext) -> None:
    await ctx.emit.step("echo", "Echoing message", status="start")
    await ctx.emit.step("echo", "Echoing message", status="finish")
    await ctx.emit.result({"message": params.message})
