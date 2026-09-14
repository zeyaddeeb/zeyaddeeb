export const experience = [
	{
		company: "Saks Global",
		title: "Director, Engineering · Machine Learning",
		start: "Jan 2023",
		end: "Jul 2026",
		location: "New York, NY",
		progression: "Senior Manager, Engineering → Director, Engineering",
		points: [
			"Architect and lead engineer for recommendations at Saks Fifth Avenue, Neiman Marcus, and Bergdorf Goodman. The platform served 10M+ monthly users and 250M+ recommendations a month with 99.9% availability.",
			"Designed embedding-based candidate retrieval with real-time session features and learned ranking. Kept p95 serving latency below 300 ms; personalization increased conversion by 7%.",
			"Wrote Rust services for feature retrieval, caching, and model inference. Ran embedding and ranking models on autoscaled GPUs, and evaluated LLM-based retrieval and reranking through offline evaluation and A/B tests.",
			"Built batch and streaming pipelines processing more than 50 TB a month on AWS EKS. Added OpenTelemetry tracing, shared deployment components, and infrastructure as code, cutting production debugging time by about half.",
			"Managed the recommendation roadmap and infrastructure budget, including vendor selection and build-versus-buy decisions for models and GPU capacity.",
		],
	},
	{
		company: "theSkimm",
		title: "Senior Director, Machine Learning",
		start: "Jun 2021",
		end: "Jan 2023",
		location: "New York, NY",
		progression: "Director, Data Science → Senior Director, Machine Learning",
		points: [
			"Led data and engineering teams working on personalization, audience analysis, ad placement, and editorial automation.",
			"Developed reinforcement learning models for ad and content placement. Built an adaptive ad placement service that improved ad performance by 20%.",
			"Automated roughly 40% of manual editorial production with LLM and NLP tools while maintaining editorial quality.",
			"Built reusable ingestion pipelines and production APIs for audience segmentation, personalized content delivery, and advertising revenue analysis.",
		],
	},
	{
		company: "Pixability",
		title: "Director, Data Science",
		start: "Apr 2020",
		end: "May 2021",
		location: "New York, NY",
		points: [
			"Led the team that built the first automated brand safety product, from prototype to production, generating $10M in new revenue.",
			"Built real-time video and text classification services with Kafka Streams and PyTorch, halving end-to-end classification latency.",
			"Rewrote performance-critical Python services in Rust, improving execution speed by 60% and cutting infrastructure costs by 40%.",
			"Ran 10+ services processing more than 1B decisions a month on AWS GPUs, using autoscaling and spot capacity to manage costs.",
		],
	},
	{
		company: "ViacomCBS",
		title: "Director, Data Science",
		start: "May 2019",
		end: "Apr 2020",
		location: "New York, NY",
		progression: "Senior Principal Data Scientist → Director, Data Science",
		points: [
			"Managed 15+ engineers and data scientists building ad inventory forecasts, optimization services, and data infrastructure.",
			"Developed reinforcement learning models for ad and content placement. Combined linear programming with demand forecasts to improve inventory management efficiency by 30%.",
			"Moved production workloads to Kubernetes and Airflow, replacing manual deployments with automated pipelines and canary releases.",
			"Built experimentation and deployment components adopted by other departments, and reported engineering plans, progress, and ROI to senior leadership.",
		],
	},
	{
		company: "Label Insight",
		title: "Senior Data Scientist",
		start: "Jul 2018",
		end: "May 2019",
		location: "Chicago, IL",
		progression:
			"Senior Software Engineer, Machine Learning → Senior Data Scientist",
		points: [
			"Implemented a computer vision and NLP pipeline with YOLO, ONNX, and spaCy to extract product, brand, and ingredient data from packaging, improving extraction accuracy by 30%.",
			"Automated extraction model updates with feedback loops, continuous retraining, and deployment pipelines.",
			"Containerized packaging extraction services on AWS, cutting compute costs by 25%.",
		],
	},
	{
		company: "Caleres",
		title: "Manager, Advanced Analytics",
		start: "Sep 2015",
		end: "Jul 2018",
		location: "St. Louis, MO",
		progression:
			"Analytics Specialist → Senior Analytics Specialist → Manager, Advanced Analytics",
		points: [
			"Led the team building retail recommendation, customer segmentation, forecasting, and marketing decision systems; marketing ROI improved by 10%.",
			"Built ETL pipelines and led a warehouse migration that cut manual data work by 40% and halved query times.",
			"Set analytics priorities with marketing, sales, and operations teams.",
		],
	},
	{
		company: "CBRE",
		title: "Program Manager, Innovation & Analytics",
		start: "May 2013",
		end: "Aug 2015",
		location: "St. Louis, MO",
		progression: "Business Analyst → Senior Data Analyst → Program Manager",
		points: [
			"Built data warehousing, IoT automation, and reporting systems, improving data retrieval speed by 35%.",
			"Automated IoT data collection and validation on AWS, halving manual data entry.",
		],
	},
];

export const skills = [
	[
		"Distributed systems",
		"Rust, Python, Kafka and Kafka Streams, gRPC, low-latency APIs, event-driven architecture, caching, fault-tolerant services.",
	],
	[
		"ML & AI",
		"Reinforcement learning, embedding and two-tower retrieval, approximate nearest neighbor search, vector stores, ranking, RAG, semantic search, GPU inference, feature stores, offline and online evaluation.",
	],
	[
		"Platform engineering",
		"Kubernetes, AWS EKS, Terraform, OpenTelemetry, CI/CD, canary deployments, production readiness.",
	],
	[
		"Data infrastructure",
		"Streaming and batch feature pipelines, Spark, Airflow, Snowflake, BigQuery.",
	],
	[
		"Cloud & operations",
		"AWS, GCP, autoscaling, GPU capacity and cost management, observability, reliability and cost optimization.",
	],
	[
		"Engineering leadership",
		"Hiring, mentoring, team management, project planning, platform roadmaps, budget ownership, vendor selection, build-versus-buy decisions.",
	],
	[
		"Development tools",
		"Claude Code, OpenAI Codex, GitHub Copilot: coding, refactoring, testing, and infrastructure changes.",
	],
] as const;

export const education = [
	["M.S. Computer Science", "University of Illinois"],
	["B.S. Computer Science", "University of Maryland"],
	["B.S. Mathematics", "Indiana University"],
] as const;
