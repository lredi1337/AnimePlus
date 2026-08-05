/**
 * Cloudflare Worker Proxy for Shikimori OAuth 2.0 (Anime+ Extension)
 * 
 * Инструкция по деплою (1-2 минуты):
 * 1. Зайдите на https://dash.cloudflare.com -> Workers & Pages -> Create Application -> Create Worker
 * 2. Вставьте весь этот код в редактор Cloudflare Worker и нажмите "Save and deploy"
 * 3. (Опционально) В настройках воркера Settings -> Variables -> Environment Variables добавьте:
 *    - SHIKI_CLIENT_ID = "ваш_client_id"
 *    - SHIKI_CLIENT_SECRET = "ваш_client_secret"
 * 4. Скопируйте полученный URL воркера (например: https://animeplus-shiki-oauth.yourname.workers.dev)
 */

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };

        // Обработка префлайт-запроса CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            const clientId = env.SHIKI_CLIENT_ID || "NschdT6XXv8H3IjrJ7DSzDPibY6I16hC_dBPxMs5vqo";
            const clientSecret = env.SHIKI_CLIENT_SECRET || "BL0ksELkohYC3aVVsuN2csKtn340FyhfqWrarSah-Bc";

            let requestData = {};
            const contentType = request.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                requestData = await request.json();
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                const formData = await request.formData();
                for (const [key, value] of formData.entries()) {
                    requestData[key] = value;
                }
            }

            const bodyParams = new URLSearchParams();
            bodyParams.append('grant_type', requestData.grant_type || 'authorization_code');
            bodyParams.append('client_id', requestData.client_id || clientId);
            bodyParams.append('client_secret', clientSecret);

            if (requestData.code) {
                bodyParams.append('code', requestData.code);
            }
            if (requestData.redirect_uri) {
                bodyParams.append('redirect_uri', requestData.redirect_uri);
            }
            if (requestData.refresh_token) {
                bodyParams.append('refresh_token', requestData.refresh_token);
            }

            const domains = ['https://shikimori.one', 'https://shikimori.me', 'https://shikimori.io'];
            let lastResponse = null;

            for (const domain of domains) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 3000);

                    const shikiRes = await fetch(`${domain}/oauth/token`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'AnimePlus/9.1.0 (Cloudflare Worker Proxy)'
                        },
                        body: bodyParams.toString(),
                        signal: controller.signal
                    });
                    clearTimeout(timer);

                    if (shikiRes.ok || (shikiRes.status >= 400 && shikiRes.status < 500 && shikiRes.status !== 404)) {
                        const responseData = await shikiRes.text();
                        return new Response(responseData, {
                            status: shikiRes.status,
                            headers: {
                                ...corsHeaders,
                                'Content-Type': 'application/json'
                            }
                        });
                    }
                    lastResponse = shikiRes;
                } catch (e) {}
            }

            return new Response(JSON.stringify({ error: 'Failed to communicate with Shikimori servers' }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
