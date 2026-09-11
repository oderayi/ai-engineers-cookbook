"""Tests for `skillet recipes validate`."""

from pathlib import Path

from skillet.cli import cmd_validate, main

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def test_both_fixture_recipes_pass(capsys) -> None:
    exit_code = cmd_validate(FIXTURES_ROOT)
    out = capsys.readouterr().out
    assert exit_code == 0
    assert "ok   demo/echo" in out
    assert "ok   demo/echo-with-helper" in out


def test_missing_referenced_fixture_fails(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n",
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    docs = ctx.files.fixtures('does-not-exist')\n"
        "    await ctx.emit.result({})\n",
    )

    exit_code = cmd_validate(root)
    out = capsys.readouterr().out
    assert exit_code == 1
    assert "FAIL g/x" in out
    assert "does-not-exist" in out


def test_env_entry_without_provider_fails(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n\n"
        '[[recipe.env]]\nkey = "SOME_KEY"\nprovider = ""\nrequired = true\n',
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n",
    )

    exit_code = cmd_validate(root)
    out = capsys.readouterr().out
    assert exit_code == 1
    assert "FAIL g/x" in out
    assert "SOME_KEY" in out


def test_invalid_example_params_fails(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n\n"
        '[[recipe.example]]\ntitle = "Bad"\n'
        "[recipe.example.params]\n"
        'not_a_field = "sneaky"\n',
    )
    write(
        root / "g" / "10-x" / "recipe.py",
        "from pydantic import Field\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n"
        "    question: str = Field(...)\n\n"
        "async def run(params, ctx):\n    await ctx.emit.result({})\n",
    )

    exit_code = cmd_validate(root)
    out = capsys.readouterr().out
    assert exit_code == 1
    assert "FAIL g/x" in out
    assert "Bad" in out


def test_broken_recipe_module_fails(tmp_path: Path, capsys) -> None:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        '[recipe]\nslug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n",
    )
    write(root / "g" / "10-x" / "recipe.py", "def not_async_run(params, ctx): pass\n")

    exit_code = cmd_validate(root)
    assert exit_code == 1


def test_via_main_entrypoint(capsys) -> None:
    exit_code = main(["recipes", "validate", "--root", str(FIXTURES_ROOT)])
    assert exit_code == 0
