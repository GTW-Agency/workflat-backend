import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// GET /api/v1/content/blogs
router.get('/blogs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const [posts, total] = await Promise.all([
      prisma.content.findMany({
        where: { type: 'BLOG', status: 'PUBLISHED' },
        select: {
          id: true, title: true, slug: true, excerpt: true,
          featured_image: true, published_at: true,
          author: { select: { email: true } },
        },
        orderBy: { published_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.content.count({ where: { type: 'BLOG', status: 'PUBLISHED' } }),
    ]);

    res.json({
      success: true,
      data: posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/content/blogs/:slug
router.get('/blogs/:slug', async (req: Request, res: Response) => {
  try {
    const post = await prisma.content.findFirst({
      where: { slug: req.params.slug, type: 'BLOG', status: 'PUBLISHED' },
      include: { author: { select: { email: true } } },
    });
    if (!post) { res.status(404).json({ success: false, error: 'Post not found' }); return; }
    res.json({ success: true, data: post });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/content/faqs
router.get('/faqs', async (_req: Request, res: Response) => {
  try {
    const faqs = await prisma.content.findMany({
      where: { type: 'FAQ', status: 'PUBLISHED' },
      select: { id: true, title: true, content: true },
      orderBy: { created_at: 'asc' },
    });
    res.json({ success: true, data: faqs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/content/pages/:slug
router.get('/pages/:slug', async (req: Request, res: Response) => {
  try {
    const page = await prisma.content.findFirst({
      where: { slug: req.params.slug, type: 'PAGE', status: 'PUBLISHED' },
    });
    if (!page) { res.status(404).json({ success: false, error: 'Page not found' }); return; }
    res.json({ success: true, data: page });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
