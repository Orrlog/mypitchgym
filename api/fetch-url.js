// Fetch URL content for product page analysis
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!parsedUrl.protocol.startsWith('http')) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs allowed' });
    }

    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyPitchGymBot/1.0)'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(200).json({ content: null, error: 'Could not fetch page' });
    }

    const html = await response.text();
    
    // Extract text content - strip scripts, styles, tags
    let text = html;
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, ' ').trim();

    // Limit to first 3000 chars
    if (text.length > 3000) text = text.substring(0, 3000);

    return res.status(200).json({ content: text });
  } catch (error) {
    console.error('Fetch URL error:', error);
    return res.status(200).json({ content: null, error: error.message });
  }
};
