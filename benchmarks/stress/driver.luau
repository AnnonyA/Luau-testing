-- benchmark-vm sets f to the function returned by the subject.
for _, seed in {-17, -7, -3, -1, 0, 1, 2, 5, 7, 18, 31} do
    local result = table.pack(pcall(f, seed))
    local fields = {tostring(seed), tostring(result.n)}
    for i = 1, result.n do
        fields[#fields + 1] = tostring(result[i])
    end
    print(table.concat(fields, "|"))
end
