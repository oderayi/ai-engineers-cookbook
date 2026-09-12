import { RecipeView } from "./recipe-view";

export default async function RecipePage({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  return <RecipeView slug={slug} />;
}
