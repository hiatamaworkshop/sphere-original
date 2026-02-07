-- PostgreSQL + pgvector initialization script
-- Sphere Project - Reference DB Schema

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sphere Nodes Table
CREATE TABLE IF NOT EXISTS sphere_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Physics
    position vector(384) NOT NULL,
    weight FLOAT NOT NULL DEFAULT 0.1,
    decay FLOAT NOT NULL DEFAULT 0.05,
    heat FLOAT NOT NULL DEFAULT 0.0,
    ttl FLOAT NOT NULL DEFAULT 86400.0,
    flags INTEGER NOT NULL DEFAULT 0,

    -- State
    state VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Metrics
    traversal_count INTEGER NOT NULL DEFAULT 0,
    stay_time_total FLOAT NOT NULL DEFAULT 0.0,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Spatial Fields Table
CREATE TABLE IF NOT EXISTS spatial_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grid_position vector(384) NOT NULL,
    fertility FLOAT NOT NULL DEFAULT 0.0,
    plankton_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Spectral Links Table
CREATE TABLE IF NOT EXISTS spectral_links (
    source_id UUID NOT NULL REFERENCES sphere_nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES sphere_nodes(id) ON DELETE CASCADE,
    flow FLOAT NOT NULL DEFAULT 0.0,
    weight FLOAT NOT NULL DEFAULT 0.1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_id, target_id)
);

-- Indexes for performance
CREATE INDEX idx_nodes_state ON sphere_nodes(state);
CREATE INDEX idx_nodes_heat ON sphere_nodes(heat DESC);
CREATE INDEX idx_nodes_created ON sphere_nodes(created_at DESC);
CREATE INDEX idx_spatial_fertility ON spatial_fields(fertility DESC);

-- Vector similarity index (HNSW for fast approximate search)
CREATE INDEX idx_nodes_position_hnsw ON sphere_nodes
USING hnsw (position vector_cosine_ops);

-- Comments
COMMENT ON TABLE sphere_nodes IS 'Physical nodes in Sphere space';
COMMENT ON TABLE spatial_fields IS 'Grid-based fertility and plankton tracking';
COMMENT ON TABLE spectral_links IS 'Connections between nodes based on agent traversal';
