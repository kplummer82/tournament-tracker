import type { GetStaticPaths, GetStaticProps } from "next";
import { GuideLayout } from "@/components/learn/GuideLayout";
import { GUIDES, getGuide } from "@/lib/learn/registry";

export default function GuidePage({ slug }: { slug: string }) {
  const guide = getGuide(slug);
  if (!guide) return null; // unreachable with fallback: false
  return <GuideLayout guide={guide} />;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: GUIDES.map((g) => ({ params: { slug: g.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = String(params?.slug ?? "");
  if (!getGuide(slug)) return { notFound: true };
  return { props: { slug } };
};
