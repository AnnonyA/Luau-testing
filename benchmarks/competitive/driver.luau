-- The isolated benchmark VM injects the subject's returned function as f.
for _, limit in {-2, 0, 1, 3, 5, 10} do
    local result = table.pack(f(limit))
    local parts = {string.format("%d:%d", limit, result.n)}
    for index = 1, result.n do
        table.insert(parts, tostring(result[index]))
    end
    print(table.concat(parts, "|"))
end
