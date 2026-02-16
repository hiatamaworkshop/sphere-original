"""
Explorers — Gradio MVP

Minimal UI to launch phi-agent containers and observe their perception cycles.
Displays: species selector, execute button, real-time cycle viewer.

Architecture:
  UI (Gradio) → executor.py (Docker) → phi-agent → Sphere API
"""

import gradio as gr
import os
import json
from pathlib import Path
from executor import execute_phi_agent
from parser import parse_cycles, format_cycle_output, format_summary, format_combined_output, extract_narrative, extract_broadcast
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Available species (9 loadouts)
SPECIES = [
    "balanced",
    "scholar",
    "scout",
    "archivist",
    "hunter",
    "moth",
    "hermit",
    "wanderer",
    "sniper"
]

# Species descriptions (brief)
SPECIES_DESC = {
    "balanced": "Generalist — even weights, explore mode",
    "scholar": "Deep reader — high weight sensitivity, deep mode",
    "scout": "Quick surveyor — fast return, explore mode",
    "archivist": "Preservationist — loves Amber (frozen) nodes",
    "hunter": "Heat seeker — chases high-heat areas",
    "moth": "Heat generator — evaluates everything as hot",
    "hermit": "Stability seeker — avoids crowds, deep mode",
    "wanderer": "Exhaustive explorer — never returns until energy is gone",
    "sniper": "Selective evaluator — harsh scorer, high standards"
}

# Models capable of real measurement (not stamps)
MEASUREMENT_MODELS = {"phi3:mini", "llama3.2:1b"}


def load_generations(max_gens=10):
    """
    Load latest N generations from shared volume.

    Args:
        max_gens: Maximum number of generations to load

    Returns:
        List of generation dictionaries (sorted newest first)
    """
    gen_dir = Path("/app/data/generations")
    if not gen_dir.exists():
        return []

    files = sorted(gen_dir.glob("gen-*.json"), reverse=True)
    generations = []

    for f in files[:max_gens]:
        try:
            with open(f) as fp:
                generations.append(json.load(fp))
        except Exception:
            continue

    return generations


def visualize_generations():
    """
    Load generations and create visualization.

    Returns:
        (info_text, species_plot, timeline_plot)
    """
    gens = load_generations()

    if not gens:
        return "No generation data yet. Run agents to accumulate evaluations, then wait for Digestor to run.", None, None

    latest = gens[0]

    # Generate info text
    info_text = f"""### Generation {latest['generation']}
**Timestamp**: {latest['timestamp']}
**Hunger**: {latest['hunger']:.2f}
**Evaluations**: {latest['inputEvaluations']} → {latest['survivedEvaluations']} survived ({latest['survivedEvaluations']/latest['inputEvaluations']*100:.1f}%)
"""

    # Create species comparison plot (latest generation)
    species_names = list(latest['species'].keys())
    species_data = [latest['species'][name] for name in species_names]

    fig_species = make_subplots(
        rows=3, cols=1,
        subplot_titles=("Average Scores (h/w/d)", "Evaluation Consistency", "Evaluation Counts"),
        vertical_spacing=0.1
    )

    # Row 1: Scores
    fig_species.add_trace(
        go.Bar(name='avgH', x=species_names, y=[d['avgH'] for d in species_data]),
        row=1, col=1
    )
    fig_species.add_trace(
        go.Bar(name='avgW', x=species_names, y=[d['avgW'] for d in species_data]),
        row=1, col=1
    )
    fig_species.add_trace(
        go.Bar(name='avgD', x=species_names, y=[d['avgD'] for d in species_data]),
        row=1, col=1
    )

    # Row 2: Evaluation consistency
    consistency_scores = [
        d.get('evaluationConsistency', {}).get('score', 0) for d in species_data
    ]
    consistency_nodes = [
        d.get('evaluationConsistency', {}).get('nodes', 0) for d in species_data
    ]
    consistency_text = [
        f"{s:.2f} ({n} nodes)" for s, n in zip(consistency_scores, consistency_nodes)
    ]
    fig_species.add_trace(
        go.Bar(
            name='Consistency',
            x=species_names,
            y=consistency_scores,
            text=consistency_text,
            textposition='outside',
            marker_color=['#2ecc71' if s >= 0.85 else '#f39c12' if s >= 0.7 else '#e74c3c' for s in consistency_scores]
        ),
        row=2, col=1
    )

    # Row 3: Evaluation counts
    fig_species.add_trace(
        go.Bar(name='Evaluations', x=species_names, y=[d['evaluations'] for d in species_data], marker_color='lightblue'),
        row=3, col=1
    )

    fig_species.update_layout(
        height=800,
        title_text=f"Species Comparison (Generation {latest['generation']})",
        showlegend=True
    )

    fig_species.update_xaxes(title_text="Species", row=3, col=1)
    fig_species.update_yaxes(title_text="Score", row=1, col=1)
    fig_species.update_yaxes(title_text="Consistency", range=[0, 1], row=2, col=1)
    fig_species.update_yaxes(title_text="Count", row=3, col=1)

    # Create timeline plot (if multiple generations exist)
    timeline_plot = None
    if len(gens) > 1:
        # Sort chronologically
        gens_sorted = sorted(gens, key=lambda g: g['generation'])

        fig_timeline = make_subplots(
            rows=2, cols=1,
            subplot_titles=("avgH Evolution", "Consistency Evolution"),
            vertical_spacing=0.15
        )

        # Row 1: avgH per species over generations
        for species in species_names:
            gen_nums = [g['generation'] for g in gens_sorted if species in g['species']]
            avgH = [g['species'][species]['avgH'] for g in gens_sorted if species in g['species']]

            fig_timeline.add_trace(go.Scatter(
                x=gen_nums,
                y=avgH,
                mode='lines+markers',
                name=f"{species} (H)"
            ), row=1, col=1)

        # Row 2: consistency per species over generations
        for species in species_names:
            gen_nums = [g['generation'] for g in gens_sorted if species in g.get('species', {})]
            cons = [
                g['species'][species].get('evaluationConsistency', {}).get('score', None)
                for g in gens_sorted if species in g.get('species', {})
            ]
            # Filter out None (generations before consistency was implemented)
            valid = [(gn, c) for gn, c in zip(gen_nums, cons) if c is not None]
            if valid:
                fig_timeline.add_trace(go.Scatter(
                    x=[v[0] for v in valid],
                    y=[v[1] for v in valid],
                    mode='lines+markers',
                    name=f"{species} (C)",
                    showlegend=False
                ), row=2, col=1)

        fig_timeline.update_layout(height=600)
        fig_timeline.update_xaxes(title_text="Generation", row=2, col=1)
        fig_timeline.update_yaxes(title_text="avgH", row=1, col=1)
        fig_timeline.update_yaxes(title_text="Consistency", range=[0, 1], row=2, col=1)

        timeline_plot = fig_timeline

    return info_text, fig_species, timeline_plot


def launch_agent(species, query, sphere_url, ollama_host, model="llama3.2:1b", evaluate=True):
    """
    Launch phi-agent Docker container and stream results.

    Args:
        species: Loadout name (e.g., "wanderer")
        query: Search query
        sphere_url: Sphere API endpoint (e.g., https://sphere-api.render.com)
        ollama_host: Ollama host (e.g., http://host.docker.internal:11434)
        model: LLM model to use
        evaluate: Whether to evaluate nodes (write back to Sphere)

    Yields:
        (status_text, narrative_output, combined_output, broadcast_output)
    """
    if not query.strip():
        yield ("❌ Error: Query cannot be empty", "*No narrative*", "", "")
        return

    if not sphere_url.strip() or not ollama_host.strip():
        yield ("❌ Error: Sphere URL and Ollama Host must be set", "*No narrative*", "", "")
        return

    eval_label = "evaluate ON" if evaluate else "observe only"
    yield (f"🚀 Launching {species} agent ({eval_label})...", "*Agent is exploring...*", "", "")

    try:
        # Execute phi-agent
        stdout = execute_phi_agent(
            loadout=species,
            query=query,
            sphere_url=sphere_url,
            ollama_host=ollama_host,
            model=model,
            evaluate=evaluate
        )

        yield (f"✅ Execution complete", "*Parsing output...*", "Parsing output...", "")

        # Parse cycles
        cycles = parse_cycles(stdout)

        if not cycles:
            yield (
                "⚠️ No cycles parsed from output",
                "*No narrative generated*",
                stdout[-2000:] if len(stdout) > 2000 else stdout,
                ""
            )
            return

        # Format combined output first (display immediately)
        combined = format_combined_output(cycles, species)

        # Show cycle data immediately while narrative is being extracted
        yield (
            f"✅ {species} completed {len(cycles)} cycles",
            "*Generating narrative...*",
            combined,
            ""
        )

        # Extract narrative and broadcast
        narrative = extract_narrative(stdout)
        broadcast_posts = extract_broadcast(stdout)
        broadcast_text = "\n\n".join(
            f"**[{i+1}/{len(broadcast_posts)}]**\n```\n{post}\n```"
            for i, post in enumerate(broadcast_posts)
        ) if broadcast_posts else "*No broadcast generated*"

        # Update with final results
        yield (
            f"✅ {species} completed {len(cycles)} cycles",
            narrative,
            combined,
            broadcast_text
        )

    except Exception as e:
        yield (f"❌ Error: {str(e)}", "*Error occurred*", "", "")


def create_ui():
    """Create Gradio UI."""

    theme = gr.themes.Default(
        primary_hue="slate",
        neutral_hue="slate",
        font=["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"]
    )

    css = """
    .gradio-container {
        max-width: 1200px !important;
    }
    .species-card {
        border: 1px solid #e0e0e0;
        padding: 12px;
        border-radius: 4px;
        background: #ffffff;
    }
    """

    with gr.Blocks(title="Explorers — Sphere") as app:

        gr.Markdown("""
        # Explorers — Sphere

        Launch phi-agent with different Loadouts (personality presets) and observe their perception cycles. Each species has different weights, quality vectors, and return behaviors — producing distinct exploration patterns. The agent's personality emerges from: Loadout (vectors) × Physics (Sphere) × Sensor (LLM).
        """)

        with gr.Tabs():
            # Agent Tab
            with gr.Tab("Agent"):
                with gr.Row():
                    with gr.Column(scale=1):
                        gr.Markdown("## Configuration")

                        query_input = gr.Textbox(
                            label="Query",
                            placeholder="e.g., journey",
                            value="journey",
                            lines=2,
                            max_lines=4,
                            max_length=500
                        )

                        model_input = gr.Dropdown(
                            choices=["llama3.2:1b", "qwen2.5:1.5b", "gemma2:2b", "phi3:mini"],
                            value="llama3.2:1b",
                            label="Model",
                            info="Ollama model name"
                        )

                        species_dropdown = gr.Dropdown(
                            choices=SPECIES,
                            value="balanced",
                            label="Species (Loadout)",
                            info="Select personality preset"
                        )

                        species_info = gr.Textbox(
                            value=SPECIES_DESC["balanced"],
                            label="Description",
                            interactive=False,
                            lines=2
                        )

                        evaluate_checkbox = gr.Checkbox(
                            value=True,
                            label="Evaluate nodes",
                            info="Write evaluations to Sphere. OFF = observe + narrative only (faster, no data contamination)"
                        )

                        with gr.Accordion("Advanced Settings", open=False):
                            sphere_url_input = gr.Textbox(
                                label="Sphere API URL",
                                value=os.getenv("SPHERE_URL", "http://localhost:3001"),
                                info="Sphere periphery endpoint",
                                max_length=200
                            )

                            ollama_host_input = gr.Textbox(
                                label="Ollama Host",
                                value=os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434"),
                                info="Ollama API endpoint accessible from Docker",
                                max_length=200
                            )

                        execute_btn = gr.Button("🚀 Launch Agent", variant="primary", size="lg")

                        gr.Markdown("*⏱️ Execution takes 2-4 minutes on CPU (sense/focus/evaluate + narrative)*")

                        status_text = gr.Textbox(
                            label="Status",
                            interactive=False,
                            lines=1
                        )

                    with gr.Column(scale=2):
                        gr.Markdown("## Agent Experience")

                        narrative_output = gr.Markdown(
                            label="Return Narrative",
                            value="*Agent will narrate its experience after return...*",
                        )

                        combined_output = gr.Textbox(
                            label="Cycle & Statistics",
                            interactive=False,
                            lines=20,
                            max_lines=20
                        )

                        gr.Markdown("## Broadcast (Observation Projection)")

                        broadcast_output = gr.Markdown(
                            value="*Deterministic broadcast will appear after exploration...*",
                        )

                # Update species description when dropdown changes
                species_dropdown.change(
                    fn=lambda s: SPECIES_DESC.get(s, ""),
                    inputs=species_dropdown,
                    outputs=species_info
                )

                # Auto-toggle evaluate based on model capability
                model_input.change(
                    fn=lambda m: m in MEASUREMENT_MODELS,
                    inputs=model_input,
                    outputs=evaluate_checkbox
                )

                # Execute button click
                execute_btn.click(
                    fn=launch_agent,
                    inputs=[
                        species_dropdown,
                        query_input,
                        sphere_url_input,
                        ollama_host_input,
                        model_input,
                        evaluate_checkbox
                    ],
                    outputs=[status_text, narrative_output, combined_output, broadcast_output]
                )

                gr.Markdown("""
                ---
                ### How It Works

                1. **Select Species**: Each loadout has different personality vectors
                2. **Enter Query**: Agent uses this as its search intent
                3. **Launch**: UI spawns phi-agent to Sphere
                4. **Observe**: Real-time display of sense/focus/evaluate cycles

                **Architecture**: `UI → phi-agent (Docker) → Sphere API`

                **Data Access**: L1+2 (tags + summary) and evaluations by the agent are retrieved to improve the Loadout in future generation in Digestor system.
                """)

            # Generations Tab
            with gr.Tab("Generations"):
                gr.Markdown("""
                ## Species Memory Evolution

                Visualize how species profiles evolve over generations through Digestor's metabolic cycle.
                Each generation represents a digest cycle where evaluations are scored, pruned, and blended.
                """)

                refresh_btn = gr.Button("🔄 Refresh Data", variant="secondary")

                gen_info = gr.Markdown()

                with gr.Row():
                    with gr.Column():
                        gr.Markdown("### Species Comparison (Latest Generation)")
                        species_plot = gr.Plot()

                    with gr.Column():
                        gr.Markdown("### Evolution Timeline")
                        timeline_plot = gr.Plot()

                # Refresh button click
                refresh_btn.click(
                    fn=visualize_generations,
                    outputs=[gen_info, species_plot, timeline_plot]
                )

    return app, theme, css


if __name__ == "__main__":
    app, theme, css = create_ui()
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        theme=theme,
        css=css
    )
