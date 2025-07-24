import type { NextApiRequest, NextApiResponse } from 'next';
import { writeFile } from 'fs/promises';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({ error: 'IP is required' });
      }

      const filePath = path.join(process.cwd(), 'latest_ip.txt');
      await writeFile(filePath, ip, 'utf-8');

      return res.status(200).json({ message: 'IP updated', ip });
    } catch (error: any) {
      return res.status(500).json({ error: 'Update failed', detail: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}