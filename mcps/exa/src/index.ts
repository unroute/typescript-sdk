import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	RequestSchema,
	ResultSchema,
	type ToolSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { default as exa } from "exa-js"
import { omit } from "lodash"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

const Exa = exa.default

// Define schema for each tool
export const SearchArgsSchema = z
	.object({
		query: z.string().describe("The query string."),
		useAutoprompt: z
			.boolean()
			.optional()
			.describe(
				"If true, your query will be converted to a Exa query. Default to 'false'. Neural or Auto search only.",
			),
		type: z
			.enum(["keyword", "neural", "auto"])
			.optional()
			.describe(
				"The Type of search, 'keyword', 'neural', or 'auto' (decides between keyword and neural). Default to 'neural'.",
			),
		category: z
			.enum([
				"company",
				"research paper",
				"news",
				"linkedin profile",
				"github",
				"tweet",
				"movie",
				"song",
				"personal site",
				"pdf",
				"financial report",
			])
			.optional()
			.describe(
				"(beta) A data category to focus on, with higher comprehensivity and data cleanliness.",
			),
		numResults: z
			.number()
			.int()
			.min(1)
			.max(10000)
			.optional()
			.default(10)
			.describe("Number of search results to return. Default to 10."),
		includeDomains: z
			.array(z.string())
			.optional()
			.describe("List of domains to include in the search."),
		excludeDomains: z
			.array(z.string())
			.optional()
			.describe("List of domains to exclude in the search."),
		startCrawlDate: z
			.string()
			.datetime()
			.optional()
			.describe(
				"Crawl date refers to the date that Exa discovered a link. Results will include links that were crawled after this date.",
			),
		endCrawlDate: z
			.string()
			.datetime()
			.optional()
			.describe(
				"Crawl date refers to the date that Exa discovered a link. Results will include links that were crawled before this date.",
			),
		startPublishedDate: z
			.string()
			.datetime()
			.optional()
			.describe(
				"Only links with a published date after this will be returned.",
			),
		endPublishedDate: z
			.string()
			.datetime()
			.optional()
			.describe(
				"Only links with a published date before this will be returned.",
			),
		includeText: z
			.array(z.string())
			.max(1)
			.optional()
			.describe(
				"List of strings that must be present in webpage text of results. Currently, only 1 string is supported, of up to 5 words.",
			),
		excludeText: z
			.array(z.string())
			.max(1)
			.optional()
			.describe(
				"List of strings that must not be present in webpage text of results. Currently, only 1 string is supported, of up to 5 words.",
			),
		contents: z
			.object({
				text: z
					.object({
						maxCharacters: z
							.number()
							.int()
							.optional()
							.describe("Max length in characters for the text returned"),
						includeHtmlTags: z
							.boolean()
							.optional()
							.default(false)
							.describe("Whether HTML tags should be included. Default false"),
					})
					.optional()
					.describe("Parsed contents of the page."),
				highlights: z
					.object({
						numSentences: z
							.number()
							.int()
							.optional()
							.default(5)
							.describe(
								"The number of sentences to be returned in each snippet. Default 5",
							),
						highlightsPerUrl: z
							.number()
							.int()
							.optional()
							.default(1)
							.describe("The number of snippets to return per page. Default 1"),
						query: z.string().optional().describe("Query for highlights"),
					})
					.optional()
					.describe("Relevant extract(s) from the webpage."),
				summary: z
					.object({
						query: z
							.string()
							.optional()
							.describe(
								"If specified, tries to answer the query in the summary",
							),
					})
					.optional(),
			})
			.optional(),
	})
	.describe("Search parameters for Exa API")

type ToolInput = z.infer<typeof ToolSchema.shape.inputSchema>

export const AuthRequestSchema = RequestSchema.extend({
	method: z.literal("auth"),
	params: z.object({
		apiKey: z.string(),
	}),
})
export const AuthResultSchema = ResultSchema.extend({})

export function createServer() {
	const server = new Server(
		{
			name: "exa",
			version: "1.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	)

	// Initialize Exa client
	const globals = {
		exa: null as InstanceType<typeof Exa> | null,
	}

	server.setRequestHandler(AuthRequestSchema, async (request) => {
		const { apiKey } = request.params
		globals.exa = new Exa(apiKey)
		return {}
	})

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				{
					name: "search",
					description: "Search the web using semantic queries.",
					inputSchema: zodToJsonSchema(SearchArgsSchema) as ToolInput,
				},
			],
		}
	})

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		try {
			const { name, arguments: args } = request.params

			if (!globals.exa) {
				throw new Error("Unrecoverable error: Not authenticated.")
			}

			switch (name) {
				case "search": {
					const parsed = SearchArgsSchema.safeParse(args)
					if (!parsed.success) {
						throw new Error(`Invalid arguments: ${parsed.error}`)
					}

					const results = await globals.exa.search(
						parsed.data.query,
						omit(parsed.data, "query"),
					)
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(results),
							},
						],
					}
				}

				default:
					throw new Error(`Unknown tool: ${name}`)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			return {
				content: [{ type: "text", text: `Error: ${errorMessage}` }],
				isError: true,
			}
		}
	})

	return server
}
