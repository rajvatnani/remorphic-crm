'use server'

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ITEM_TAGS, cleanTags } from '@/lib/item-tags'

// "Fill details from photo with AI": Claude looks at an item photo and
// writes its name, description, category and tags, following the
// business's own writing instructions. The owner reviews before saving.

const MODEL = 'claude-opus-5-5'
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export async function aiConfigured(): Promise<boolean> {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

const Suggestion = z.object({
  name: z.string().describe('Short item name a shopper would search for, with size or variant if visible. At most 80 characters.'),
  description: z.string().describe('2 to 4 short sentences: what it is, material and finish, size if visible, and a use or gifting idea.'),
  category: z.string().describe('Exactly one of the listed categories, or an empty string if none fits.'),
  tags: z.array(z.string()).describe('Zero to two tag keys from the allowed list that clearly apply.'),
})

export type ItemSuggestion = { name: string; description: string; category_id: string | null; tags: string[] }

// Only photos uploaded to this project's business-photos bucket
function ownPhoto(url: string) {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/business-photos/`
  return typeof url === 'string' && url.startsWith(base)
}

export async function describeItemFromPhoto(
  photoUrl: string,
  hints: { name?: string; description?: string } = {}
): Promise<{ ok: true; data: ItemSuggestion } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'AI is not set up yet.' }
  if (!ownPhoto(photoUrl)) return { ok: false, error: 'Add a photo first.' }

  // Signed-in members of a business only; this also picks the business
  const supabase = await createClient()
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, type, ai_instructions')
    .single()
  if (!business) return { ok: false, error: 'No business found.' }
  if (!photoUrl.includes(`/business-photos/${business.id}/`)) return { ok: false, error: 'Add a photo first.' }

  const { data: categories } = await supabase
    .from('item_categories')
    .select('id, name')
    .eq('business_id', business.id)
    .order('position')

  // Fetch the photo ourselves and send it inline
  let image: { data: string; media_type: 'image/jpeg' | 'image/png' | 'image/webp' }
  try {
    const res = await fetch(photoUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(String(res.status))
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: 'That photo is too large. Try a smaller one.' }
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const media_type = type.includes('png') ? 'image/png' : type.includes('webp') ? 'image/webp' : 'image/jpeg'
    image = { data: bytes.toString('base64'), media_type }
  } catch {
    return { ok: false, error: 'Could not read the photo. Please try again.' }
  }

  const categoryNames = (categories ?? []).map(c => c.name)
  const system = [
    `You write product listings for ${business.name}, a small Indian business (type: ${business.type}).`,
    'Look at the photo and describe only what you can see or reasonably infer. Never invent prices, brands, weights or certifications.',
    'Write in plain, warm English for shoppers on their phones, unless the instructions below ask for another style or language.',
    categoryNames.length
      ? `Categories: ${categoryNames.join(', ')}.`
      : 'There are no categories yet, so leave category empty.',
    `Allowed tag keys: ${ITEM_TAGS.map(t => `${t.key} (${t.label})`).join(', ')}. Only use new_arrival, limited_edition or selling_fast if the owner's notes say so.`,
    business.ai_instructions?.trim() ? `The owner's own instructions, which take priority on style:\n${business.ai_instructions.trim()}` : '',
  ].filter(Boolean).join('\n\n')

  const notes = [
    hints.name?.trim() ? `Name typed so far: ${hints.name.trim()}` : '',
    hints.description?.trim() ? `Notes typed so far: ${hints.description.trim()}` : '',
  ].filter(Boolean).join('\n')

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // A quick, simple task: low effort keeps it fast and cheap
      output_config: { effort: 'low', format: betaZodOutputFormat(Suggestion) },
      // If the model declines, the API retries on a suitable fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
          { type: 'text', text: `Write the listing for this item.${notes ? `\n\n${notes}` : ''}` },
        ],
      }],
    })

    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'AI could not describe this photo. Please fill the details yourself.' }
    }
    const out = response.parsed_output
    if (!out) return { ok: false, error: 'AI did not return details. Please try again.' }

    const category = (categories ?? []).find(c => c.name.toLowerCase() === out.category.trim().toLowerCase())
    return {
      ok: true,
      data: {
        name: out.name.trim().slice(0, 80),
        description: out.description.trim().slice(0, 1000),
        category_id: category?.id ?? null,
        tags: cleanTags(out.tags).slice(0, 2),
      },
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[AI] Authentication failed')
      return { ok: false, error: 'The AI key is not valid. Check ANTHROPIC_API_KEY in Vercel.' }
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'AI is busy right now. Please try again in a minute.' }
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[AI] API error', error.status)
      return { ok: false, error: 'AI could not describe this photo right now. Please try again.' }
    }
    console.error('[AI] Request failed')
    return { ok: false, error: 'AI could not be reached. Please try again.' }
  }
}
