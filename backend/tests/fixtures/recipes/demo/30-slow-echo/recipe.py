"""Slow Echo — like `10-echo`, but pauses before responding.

Exists solely for `execution`'s own Playwright E2E cancel-mid-run test
(`frontend/e2e/run-recipe.spec.ts`): a real browser click needs a recipe
slow enough that "cancel while it's running" isn't a race against an
echo that already finished by the time the click lands.
"""

import asyncio

from pydantic import Field

from skillet.recipe import Params as BaseParams
from skillet.recipe import RecipeContext


class Params(BaseParams):
    message: str = Field(..., min_length=1, description="The message to echo back.")


async def run(params: Params, ctx: RecipeContext) -> None:
    await ctx.emit.step("wait", "Thinking it over", status="start")
    await asyncio.sleep(5)
    await ctx.emit.step("wait", "Thinking it over", status="finish")
    await ctx.emit.result({"message": params.message})
