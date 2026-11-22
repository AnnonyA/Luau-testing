-- Stateful directed graph: search, reconstruction, closures and custom iterator.
return function(seed)
    local total = seed + 7
    local events = {}
    local function mark(tag, value)
        events[#events + 1] = tag .. ":" .. tostring(value)
        return value
    end
    local graph = {}
    for i = 1, 9 do
        graph[i] = {}
        for step = 1, 3 do
            local destination = (i + step * 2 - 1) % 9 + 1
            graph[i][step] = {destination, (i * step + seed) % 7 + 1}
        end
    end
    local generation = 0
    local function neighbors(node)
        local index = 0
        generation += 1
        local token = generation
        return function()
            index += 1
            local edge = graph[node][index]
            if edge then
                mark("edge" .. token, node * 100 + edge[1])
                return index, edge[1], edge[2]
            end
        end
    end
    local function shortest(start)
        local distance, previous, visited = {}, {}, {}
        for i = 1, 9 do distance[i] = math.huge end
        distance[start] = 0
        for _ = 1, 9 do
            local node, best = nil, math.huge
            for i = 1, 9 do
                if not visited[i] and distance[i] < best then
                    node, best = i, distance[i]
                end
            end
            if node == nil then break end
            visited[node] = true
            mark("pop", node)
            for _, target, cost in neighbors(node) do
                local candidate = best + cost
                if not visited[target] and candidate < distance[target] then
                    distance[target], previous[target] = candidate, node
                    mark("relax", target * 100 + candidate)
                end
            end
        end
        return distance, previous
    end
    local source = seed % 9 + 1
    local distance, previous = shortest(source)
    local function path(target)
        local seen, reversed = {}, {}
        while target and not seen[target] do
            seen[target] = true
            reversed[#reversed + 1] = target
            target = previous[target]
        end
        local out = {}
        for i = #reversed, 1, -1 do out[#out + 1] = reversed[i] end
        return table.concat(out, "."), #out
    end
    for target = 1, 9 do
        local text, length = path(target)
        mark("path" .. target, text)
        total += distance[target] * length
    end
    -- Mutate graph after the first run: closures must see the new edge costs.
    for i = 1, 9 do graph[i][2][2] = graph[i][2][2] + i % 3 end
    local changed = shortest((source % 9) + 1)
    for i = 1, 9 do total += changed[i] end
    return total, table.concat(events, ","), nil, #events
end
