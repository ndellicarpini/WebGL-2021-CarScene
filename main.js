// Nicholas Delli Carpini

// ----- GLOBALS -----

let canvasRect;

// --- GL Vars ---
let gl;
let glProgram;

let lightingFlagLoc;
let lightingFlag = true;

let textureFlagLoc;

let reflectFlagLoc;
let reflectFlag = false;

let refractFlagLoc;
let refractFlag = false;

let projectionMLoc;
let projectionM;

let viewMLoc;
let viewM;

let lightingCoordLoc;
let lightingCoord;

let diffuseVLoc;
let specularVLoc;
let ambientVLoc;
let shininessLoc;

let pointBuffer;
let normBuffer;
let texBuffer;

// --- Lighting & Camera ---

let lightA      = vec4(0.01, 0.01, 0.01, 1.0);
let lightD      = vec4(1.0, 1.0, 1.0, 1.0);
let lightS      = vec4(1.0, 1.0, 1.0, 1.0);

let shadow = false;
let shadowM = mat4();

let fov = 50;

let defaultEye = vec3(0, 6, -8);
let defaultAt = vec3(0, 0, 0)

let eye = defaultEye;
let at  = defaultAt;
let up  = vec3(0, 1, 0);

let cameraOnCar = false;

// --- Scene Data ---
let lamp;
let stop;
let street;
let streetAlt;
let sky;

let car;
let bunny;

let skybox = false;
let skyboxCoord = [
    vec4( -10, -10,  10, 1.0 ),
    vec4( -10,  10,  10, 1.0 ),
    vec4( 10,  10,  10, 1.0 ),
    vec4( 10, -10,  10, 1.0 ),
    vec4( -10, -10, -10, 1.0 ),
    vec4( -10,  10, -10, 1.0 ),
    vec4( 10,  10, -10, 1.0 ),
    vec4( 10, -10, -10, 1.0 ),
];

// --- Animation ---
let animate = false;
let animateArr = [];
let animatePos = 56;

let pathSubdivisions = 80;
let rotationSubdivision = 360/pathSubdivisions;

let transformMatrix = translate(0, 0, 0);
let transformStack = [];

// ----- MATH FUNCTIONS -----

// takes a face with more than 3 vertices and splits it into triangles
// vertices - array of a face's vertices
//
// returns new array of vertices
function faceTriangulation(vertices) {
    let retVert = [vertices[0], vertices[1], vertices[2]];

    for (let i = 3; i < vertices.length; i++) {
        retVert.push(...[vertices[0], vertices[i - 1], vertices[i]]);
    }

    return retVert;
}

// gets the vertex from an object with the largest y value
// obj - object to get the tallest vertex from
//
// returns the vertex with the largest y-val
function getTopOfObj(obj) {
    let max = -Infinity;
    let maxVert;

    let subObjArr = Object.getOwnPropertyNames(obj);
    for (let i = 0; i < subObjArr.length; i++) {
        for (let j = 0; j < obj[subObjArr[i]].vertices.length; j++) {
            if (obj[subObjArr[i]].vertices[j][1] > max) {
                max = obj[subObjArr[i]].vertices[j][1];
                maxVert = obj[subObjArr[i]].vertices[j];
            }
        }
    }

    return maxVert;
}

// creates the position array that the camera travels across
//
// returns null
function initAnimateArr() {
    let y = 0;
    for (let i = 0; i <= pathSubdivisions; i++) {
        animateArr.push(vec3(
            -3 * Math.sin(i * 2 * Math.PI / pathSubdivisions),
            y,
            3 * Math.cos(i * 2 * Math.PI / pathSubdivisions),
        ));
    }

    animateArr = animateArr.reverse();
}

// iterates the position of the camera along the animateArr, resetting to 0 to loop the animation
//
// returns null
function incrementAnimatePos() {
    if (animatePos + 1 === animateArr.length) {
        animatePos = 1;
    }
    else {
        animatePos++;
    }
}

// creates the hierarchy for the different parts of the car, making car_Cube.012 the parent and
// attaching the bunny and single vertices for the camera eye and at
//
// returns null
function buildCarHierarchy() {
    let tempObj = {};
    let carBody = "car_Cube.012";
    tempObj[carBody] = car[carBody];
    tempObj[carBody].children = {};

    let subObjArr = Object.getOwnPropertyNames(car);
    for (let i = 0; i < subObjArr.length; i++) {
        if (subObjArr[i] !== carBody) {
            tempObj[carBody].children[subObjArr[i]] = car[subObjArr[i]];
        }
    }

    tempObj[carBody].children["bunny"] = bunny["bunny"];
    tempObj[carBody].children["camera"] = {
        eye: {
            position: vec4(0.0, 0.0, 0.0, 1.0),
            transform: undefined,
        },
        at: {
            position: vec4(0.0, 0.0, 0.0, 1.0),
            transform: undefined,
        }
    };

    car = tempObj;
}

// sets initial transform values for car hierarchy
//
// returns null
function buildCarTransforms() {
    car["car_Cube.012"].transform = translate(animateArr[animatePos]);
    car["car_Cube.012"].children["bunny"].transform = translate(0, 0.7, 1.8);
    car["car_Cube.012"].children["camera"].eye.transform = translate(0.5, 0.4, -1.2);
    car["car_Cube.012"].children["camera"].at.transform = translate(0, 0, 10);
}

// transforms an object following the stack of transform matrices based on the hierarchy
// object - object to transform
// init - if true include initial transform values
//
// returns null
function hierarchyTransform(object, init) {
    let subObjArr = Object.getOwnPropertyNames(object);

    transformStack.push(transformMatrix);

    for (let i = 0; i < subObjArr.length; i++) {
        if (subObjArr[i] === "camera") {
            let temp = object["camera"];
            if (init) {
                transformMatrix = mult(transformMatrix, temp.eye.transform);
                temp.eye.position = mult(transformMatrix, temp.eye.position);

                transformMatrix = mult(transformMatrix, temp.at.transform);
                temp.at.position = mult(transformMatrix, temp.at.position);
            }
            else {
                temp.eye.position = mult(transformMatrix, temp.eye.position);
                temp.at.position = mult(transformMatrix, temp.at.position);
            }
        }
        else {
            if (init && object[subObjArr[i]].hasOwnProperty("transform")) {
                transformMatrix = mult(transformMatrix, object[subObjArr[i]].transform);
            }

            for (let j = 0; j < object[subObjArr[i]].vertices.length; j++) {
                object[subObjArr[i]].vertices[j] = mult(transformMatrix, object[subObjArr[i]].vertices[j]);
                object[subObjArr[i]].normals[j] = mult(transformMatrix, object[subObjArr[i]].normals[j]);
            }
        }

        if (object[subObjArr[i]].hasOwnProperty("children")) {
            hierarchyTransform(object[subObjArr[i]].children, init);
        }
    }

    transformMatrix = transformStack.pop();
}

// transforms the stop sign into its initial position
//
// returns null
function transformStop(angle, x, y, z) {
    let subObjArr = Object.getOwnPropertyNames(stop);

    for (let i = 0; i < subObjArr.length; i++) {
        for (let j = 0; j < stop[subObjArr[i]].vertices.length; j++) {
            stop[subObjArr[i]].vertices[j] = mult(rotateY(angle), stop[subObjArr[i]].vertices[j]);
            stop[subObjArr[i]].vertices[j] = mult(translate(x, y, z), stop[subObjArr[i]].vertices[j]);
        }
    }
}

// creates the skybox by triangulating the vertices defined in skyboxCoord
//
// returns null
function createSkyBox() {
    sky = {
        vertices: [],
        textCoords: [],
        textNum: [],
    }

    let textCoordArr = [
        vec2(0, 0),
        vec2(0, 1),
        vec2(1, 1),
        vec2(1, 0),
    ];

    textCoordArr = faceTriangulation(textCoordArr);

    sky.vertices.push(...faceTriangulation([skyboxCoord[1], skyboxCoord[0], skyboxCoord[3], skyboxCoord[2]].reverse()));
    sky.textNum.push(5);

    sky.vertices.push(...faceTriangulation([skyboxCoord[2], skyboxCoord[3], skyboxCoord[7], skyboxCoord[6]].reverse()));
    sky.textNum.push(1);

    sky.vertices.push(...faceTriangulation([skyboxCoord[3], skyboxCoord[0], skyboxCoord[4], skyboxCoord[7]].reverse()));
    sky.textNum.push(4);

    sky.vertices.push(...faceTriangulation([skyboxCoord[6], skyboxCoord[5], skyboxCoord[1], skyboxCoord[2]].reverse()));
    sky.textNum.push(3);

    sky.vertices.push(...faceTriangulation([skyboxCoord[4], skyboxCoord[5], skyboxCoord[6], skyboxCoord[7]].reverse()));
    sky.textNum.push(6);

    sky.vertices.push(...faceTriangulation([skyboxCoord[5], skyboxCoord[4], skyboxCoord[0], skyboxCoord[1]].reverse()));
    sky.textNum.push(2);

    for (let i = 0; i < 6; i++) {
        sky.textCoords.push(...textCoordArr);
    }
}

// ----- FILE FUNCTIONS -----

// loads a file from URL + name
// name - name of the file from URL to be loaded
//
// returns blob of data if file is png, else text
async function loadFile(fileDir, name) {
    if (name.includes(".png")) {
        return fetch(fileDir + name).then(r => r.blob()).then(b => {
            document.getElementById("loadText").innerHTML = "Loading " + name + "...";

            return URL.createObjectURL(b);
        });
    }
    else {
        return fetch(fileDir + name).then(r => r.text()).then(t => {
            document.getElementById("loadText").innerHTML = "Loading " + name + "...";

            return t;
        });
    }
}

// loads all of the files for the project and creates the object data for each
//
// returns null
async function loadAllFiles() {
    let dir1 = "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3_1/"
    let dir2 = "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3_2/"

    let carMFile       = await loadFile(dir1, "car.mtl");
    let carOFile       = await loadFile(dir1, "car.obj");
    let lampMFile      = await loadFile(dir1, "lamp.mtl");
    let lampOFile      = await loadFile(dir1, "lamp.obj");
    let stopIFile      = await loadFile(dir1, "stop.png");
    let stopMFile      = await loadFile(dir1, "stopsign.mtl");
    let stopOFile      = await loadFile(dir1, "stopsign.obj");
    let streetMFile    = await loadFile(dir1, "street.mtl");
    let streetOFile    = await loadFile(dir1, "street.obj");
    let streetMFileAlt = await loadFile(dir1, "street_alt.mtl");
    let streetOFileAlt = await loadFile(dir1, "street_alt.obj");

    let bunnyMFile     = await loadFile(dir2, "bunny.mtl");
    let bunnyOFile     = await loadFile(dir2, "bunny.obj");

    let skyPXFile      = await loadFile(dir2, "skybox_posx.png");
    let skyNXFile      = await loadFile(dir2, "skybox_negx.png");
    let skyPYFile      = await loadFile(dir2, "skybox_posy.png");
    let skyNYFile      = await loadFile(dir2, "skybox_negy.png");
    let skyPZFile      = await loadFile(dir2, "skybox_posz.png");
    let skyNZFile      = await loadFile(dir2, "skybox_negz.png");

    let imgFileArr = [skyPXFile, skyNXFile, skyPYFile, skyNYFile, skyPZFile, skyNZFile];
    let imgArr = [];

    await parseImgFile(stopIFile, 0)
    for (let i = 0; i < imgFileArr.length; i++) {
        imgArr.push(await parseImgFile(imgFileArr[i], i + 1));
    }

    configureCubeMap(imgArr);

    document.getElementById("loadText").innerHTML = "Parsing files...";

    lamp = combineObjMtl(parseObjFile(lampOFile), parseMtlFile(lampMFile));
    street = combineObjMtl(parseObjFile(streetOFile), parseMtlFile(streetMFile));
    streetAlt = combineObjMtl(parseObjFile(streetOFileAlt), parseMtlFile(streetMFileAlt));
    stop = combineObjMtl(parseObjFile(stopOFile), parseMtlFile(stopMFile));

    car = combineObjMtl(parseObjFile(carOFile), parseMtlFile(carMFile));
    bunny = combineObjMtl(parseObjFile(bunnyOFile), parseMtlFile(bunnyMFile));

    buildCarHierarchy();

    createSkyBox();
}

// parses an image file from loadFile and configures it as a texture for texture buffers
// imgFile - image from loadFile
// i - texture slot for image (0-6)
//
// returns promise for image object for configureCubeMap
function parseImgFile(imgFile, i) {
    let img = new Image();
    img.crossOrigin = "";
    img.src = imgFile;

    return new Promise(resolve => {
        img.onload = () => {
            configureTexture(img, i);
            resolve(img);
        }
    });
}

// gets an object's attributes from a .obj file
// objFile - file to get attributes from
//
// returns an object containing all of the attributes
function parseObjFile(objFile) {
    let objLines = objFile.split("\n");

    let tempObj = {};
    let tempVerts = [], tempNorms = [], tempTex = [];
    let currLine, currSubObj, currMaterial;
    for (let i = 0; i < objLines.length; i++) {
        currLine = (objLines[i].trim()).split(" ");

        switch (currLine[0]) {
            // object hierarchy
            case "o":
                currSubObj = currLine[1];

                if (!tempObj.hasOwnProperty(currSubObj)) {
                    tempObj[currSubObj] = {};
                }

                tempObj[currSubObj].vertices = [];
                tempObj[currSubObj].normals = [];
                tempObj[currSubObj].textCoords = [];
                tempObj[currSubObj].materials = [];
                break;

            // vertices
            case "v":
                tempVerts.push(
                    vec4(parseFloat(currLine[1]), parseFloat(currLine[2]), parseFloat(currLine[3]), 1.0));
                break;

            // vertex normals
            case "vn":
                tempNorms.push(
                    vec4(parseFloat(currLine[1]), parseFloat(currLine[2]), parseFloat(currLine[3]), 0.0));
                break;

            // texture coordinates
            case "vt":
                tempTex.push(
                    vec2(parseFloat(currLine[1]), 1 - parseFloat(currLine[2])));
                break;

            // faces
            case "f":
                if (!currSubObj) {
                    console.log("No Hierarchy for faces");
                    return -1;
                }
                else if (!currMaterial) {
                    console.log("No Material for faces");
                    return -1;
                }

                let tempVIndices = [], tempNIndices = [], tempTIndices = [];
                for (let i = 1; i < currLine.length; i++) {
                    let temp = currLine[i].split("/");
                    tempVIndices.push(parseInt(temp[0]));
                    tempTIndices.push(parseInt(temp[1]));
                    tempNIndices.push(parseInt(temp[2]));
                }

                let triangVert = faceTriangulation(tempVIndices);
                let triangTex = faceTriangulation(tempTIndices);
                let triangNorm = faceTriangulation(tempNIndices);

                for (let j = 0; j < triangVert.length; j++) {
                    tempObj[currSubObj].vertices.push(triangVert[j]);
                    tempObj[currSubObj].textCoords.push(triangTex[j]);
                    tempObj[currSubObj].normals.push(triangNorm[j]);

                    tempObj[currSubObj].materials.push(currMaterial);
                }

                break;

            // material
            case "usemtl":
                currMaterial = currLine[1];
                break;
        }
    }

    let properties = Object.getOwnPropertyNames(tempObj);

    for (let i = 0; i < properties.length; i++) {
        for (let j = 0; j < tempObj[properties[i]].vertices.length; j++) {
            tempObj[properties[i]].vertices[j] = tempVerts[tempObj[properties[i]].vertices[j] - 1];
        }
        for (let j = 0; j < tempObj[properties[i]].textCoords.length; j++) {
            tempObj[properties[i]].textCoords[j] = tempTex[tempObj[properties[i]].textCoords[j] - 1];
        }

        for (let j = 0; j < tempObj[properties[i]].normals.length; j++) {
            tempObj[properties[i]].normals[j] = tempNorms[tempObj[properties[i]].normals[j] - 1];
        }
    }

    return tempObj;
}

// gets an mtl's attributes from a .mtl file
// mtlFile - file to get attributes from
//
// returns an object containing all of the mtls
function parseMtlFile(mtlFile) {
    let mtlLines = mtlFile.split("\n");

    let tempMtl = {};
    let currLine, currSubObj;
    for (let i = 0; i < mtlLines.length; i++) {
        currLine = (mtlLines[i].trim()).split(" ");

        switch (currLine[0]) {
            // material init
            case "newmtl":
                currSubObj = currLine[1];

                if (tempMtl.hasOwnProperty(currSubObj)) {
                    console.log("Material already defined", currSubObj);
                    return -1;
                }

                tempMtl[currSubObj] = {};
                tempMtl[currSubObj].ambient = undefined;
                tempMtl[currSubObj].diffuse = undefined;
                tempMtl[currSubObj].specular = undefined;
                tempMtl[currSubObj].shininess = undefined;
                tempMtl[currSubObj].optical_density = undefined;
                tempMtl[currSubObj].dissolve = undefined;
                tempMtl[currSubObj].illum = undefined;
                tempMtl[currSubObj].texture = undefined;
                break;

            // ambient
            case "Ka":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].ambient =
                    vec4(parseFloat(currLine[1]), parseFloat(currLine[2]), parseFloat(currLine[3]), 1.0);

                break;

            // diffuse
            case "Kd":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].diffuse =
                    vec4(parseFloat(currLine[1]), parseFloat(currLine[2]), parseFloat(currLine[3]), 1.0);

                break;

            // specular
            case "Ks":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].specular =
                    vec4(parseFloat(currLine[1]), parseFloat(currLine[2]), parseFloat(currLine[3]), 1.0);

                break;

            // shininess
            case "Ns":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].shininess = parseFloat(currLine[1]);

                break;

            // optical_density
            case "Ni":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].optical_density = parseFloat(currLine[1]);

                break;

            // dissolve
            case "d":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].dissolve = parseFloat(currLine[1]);

                break;

            // illum
            case "illum":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].illum = parseFloat(currLine[1]);

                break;

            // texture
            case "map_Kd":
                if (!currSubObj) {
                    console.log("No Material for definition");
                    return -1;
                }

                tempMtl[currSubObj].texture = currLine[1];

                break;
        }
    }

    return tempMtl;
}

// combines an object and mtl file into 1 object to be rendered
// obj - objFile obj from parseObjFile
// mtl - mtlFile obj from parseMtlFile
//
// returns whole object
function combineObjMtl(obj, mtl) {
    let tempObj = obj;

    let objProp = Object.getOwnPropertyNames(obj);
    let mtlProp = Object.getOwnPropertyNames(mtl);

    let tempMtl, tempMtlCount;
    for (let i = 0; i < objProp.length; i++) {
        tempMtl = obj[objProp[i]].materials;
        tempObj[objProp[i]].materials = {};

        tempMtlCount = {};

        for (let j = 0; j < tempMtl.length; j++) {
            if (!tempMtlCount.hasOwnProperty(tempMtl[j])) {
                tempMtlCount[tempMtl[j]] = [j];
            }
            else {
                tempMtlCount[tempMtl[j]].push(j);
            }
        }

        for (let j = 0; j < mtlProp.length; j++) {
            if (tempMtlCount.hasOwnProperty(mtlProp[j])) {
                tempObj[objProp[i]].materials[mtlProp[j]] = {};

                // have to set each attribute individually or else weird stuff happens
                tempObj[objProp[i]].materials[mtlProp[j]].ambient = mtl[mtlProp[j]].ambient;
                tempObj[objProp[i]].materials[mtlProp[j]].diffuse = mtl[mtlProp[j]].diffuse;
                tempObj[objProp[i]].materials[mtlProp[j]].specular = mtl[mtlProp[j]].specular;
                tempObj[objProp[i]].materials[mtlProp[j]].shininess = mtl[mtlProp[j]].shininess;
                tempObj[objProp[i]].materials[mtlProp[j]].optical_density = mtl[mtlProp[j]].optical_density;
                tempObj[objProp[i]].materials[mtlProp[j]].dissolve = mtl[mtlProp[j]].dissolve;
                tempObj[objProp[i]].materials[mtlProp[j]].illum = mtl[mtlProp[j]].illum;
                tempObj[objProp[i]].materials[mtlProp[j]].texture = mtl[mtlProp[j]].texture;
                tempObj[objProp[i]].materials[mtlProp[j]].indices = tempMtlCount[mtlProp[j]];
            }
        }

    }

    // OBJECT FORMAT:
    // group name
    // - vertices
    // - texCoords
    // - normals
    // - materials
    //   - mtl name
    //     - ambient
    //     - diffuse
    //     - specular
    //     - shininess
    //     - optical_density
    //     - dissolve
    //     - illum
    //     - texture
    //     - indices
    return tempObj;
}

// configures each texture for scene and sets each in its own sampler2D
// image - image to store in texture
// texNum - number of texture
//
// returns null
function configureTexture(image, texNum) {
    let texString = "tex" + texNum;

    let tex = gl.createTexture();

    switch (texNum) {
        case 0: {
            gl.activeTexture(gl.TEXTURE0);
            break;
        }
        case 1: {
            gl.activeTexture(gl.TEXTURE1);
            break;
        }
        case 2: {
            gl.activeTexture(gl.TEXTURE2);
            break;
        }
        case 3: {
            gl.activeTexture(gl.TEXTURE3);
            break;
        }
        case 4: {
            gl.activeTexture(gl.TEXTURE4);
            break;
        }
        case 5: {
            gl.activeTexture(gl.TEXTURE5);
            break;
        }
        case 6: {
            gl.activeTexture(gl.TEXTURE6);
            break;
        }
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

    gl.uniform1i(gl.getUniformLocation(glProgram, texString), texNum);
}

// creates a textureCube from an array of imgs and stores it in tex7
// imgArr - array to create cube from in the order (+X, -X, +Y, -Y, +Z, -Z)
//
// returns null
function configureCubeMap(imgArr) {
    let cube = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[0]);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[1]);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[2]);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[3]);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[4]);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgArr[5]);

    gl.uniform1i(gl.getUniformLocation(glProgram, "texCube"), 7);
}

// ----- GL FUNCTIONS -----

// initializes the lighting, and the view & projection matrices (view changes w/ camera rotation)
// lamp - object that the light is positioned on top of
//
// returns null
function initEnvironment() {
    let aspectRatio = canvasRect.width / canvasRect.height;

    viewM = lookAt(eye, at, up);
    projectionM = perspective(fov, aspectRatio, 0.1, 100);

    gl.uniformMatrix4fv(projectionMLoc, false, flatten(projectionM));
    gl.uniform4fv(lightingCoordLoc, flatten(lightingCoord));

    gl.uniform1i(lightingFlagLoc, (lightingFlag ? 1 : 0));
}

// sets the locations for gl variables, sets the camera position arr and the car/stopsign pos
// then renders the scene
//
// returns null
function initRender() {
    projectionMLoc = gl.getUniformLocation(glProgram, "projectionM");
    viewMLoc = gl.getUniformLocation(glProgram, "viewM");

    lightingFlagLoc = gl.getUniformLocation(glProgram, "lightingFlag");
    textureFlagLoc = gl.getUniformLocation(glProgram, "textureFlag");

    reflectFlagLoc = gl.getUniformLocation(glProgram, "reflectFlag");
    refractFlagLoc = gl.getUniformLocation(glProgram, "refractFlag");

    lightingCoordLoc = gl.getUniformLocation(glProgram, "lightingCoord");
    diffuseVLoc = gl.getUniformLocation(glProgram, "diffuseV");
    specularVLoc = gl.getUniformLocation(glProgram, "specularV");
    ambientVLoc = gl.getUniformLocation(glProgram, "ambientV");
    shininessLoc = gl.getUniformLocation(glProgram, "shininess");

    lightingCoord = getTopOfObj(lamp);

    shadowM[3][3] = 0;
    shadowM[3][1] = -1 / lightingCoord[1];

    initAnimateArr();
    buildCarTransforms();

    hierarchyTransform(car, true);
    transformStop(90, -4.2, 0, 1.5);

    document.getElementById("loadText").innerHTML = "Complete";

    render();
}

// renders the scene, if animating then translates the camera
//
// returns null
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (animate) {
        transformMatrix = translate(negate(animateArr[animatePos]));

        hierarchyTransform(car, false);

        incrementAnimatePos();
        transformMatrix = mult(translate(animateArr[animatePos]), rotateY(rotationSubdivision));
        hierarchyTransform(car, false);

        if (cameraOnCar) {
            let temp = car["car_Cube.012"].children["camera"];

            eye = vec3(temp.eye.position[0],
                temp.eye.position[1],
                temp.eye.position[2]);

            at = vec3(temp.at.position[0],
                temp.at.position[1],
                temp.at.position[2]);
        }
    }

    initEnvironment();

    if (skybox) drawSkyBox();

    drawWithMaterial(street, true, false, false);

    drawWithMaterial(streetAlt, true, false, false);

    drawWithMaterial(lamp, true, false, false);

    drawWithMaterial(car, true, true, true);

    drawWithMaterial(stop, true, true, false);

    requestAnimationFrame(render);
}

// takes an object and sets up the appropriate buffers per mtl, then draws each part of the object
// object - object to draw
// renderNorms - boolean whether to redo the normal buffers
// renderShadows - boolean whether to enable shadows for object
// renderReflect - boolean whether to enable reflections for object (if bunny enable refractions)
//
// returns null
function drawWithMaterial(object, renderNorms, renderShadows, renderReflect) {
    let subObjArr = Object.getOwnPropertyNames(object);

    let pointsToDraw, normsToDraw, texCoords;
    let subMtlArr, currMtl;
    let pointCoord = gl.getAttribLocation(glProgram, "pointCoord");
    let normalCoord = gl.getAttribLocation(glProgram, "normalCoord");
    let texCoord = gl.getAttribLocation(glProgram, "texCoord");
    for (let i = 0; i < subObjArr.length; i++) {
        if (subObjArr[i] !== "camera") {
            subMtlArr = Object.getOwnPropertyNames(object[subObjArr[i]].materials);

            for (let j = 0; j < subMtlArr.length; j++) {
                currMtl = object[subObjArr[i]].materials[subMtlArr[j]];

                pointsToDraw = currMtl.indices.map(x => object[subObjArr[i]].vertices[x]);
                normsToDraw = currMtl.indices.map(x => object[subObjArr[i]].normals[x]);

                if (currMtl.texture !== undefined) {
                    texCoords = currMtl.indices.map(x => object[subObjArr[i]].textCoords[x]);

                    if (currMtl.texture === "stop.png") {
                        gl.uniform1i(textureFlagLoc, 0);

                        texBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, flatten(texCoords), gl.STATIC_DRAW);

                        gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 0, 0);
                        gl.enableVertexAttribArray(texCoord);
                    }
                }
                else {
                    gl.uniform1i(textureFlagLoc, -1);
                }

                gl.uniform4fv(diffuseVLoc, flatten(mult(lightD, currMtl.diffuse)));
                gl.uniform4fv(specularVLoc, flatten(mult(lightS, currMtl.specular)));
                gl.uniform4fv(ambientVLoc, flatten(mult(lightA, currMtl.ambient)));
                gl.uniform1f(shininessLoc, currMtl.shininess);

                gl.uniformMatrix4fv(viewMLoc, false, flatten(viewM));

                pointBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsToDraw), gl.STATIC_DRAW);

                gl.vertexAttribPointer(pointCoord, 4, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(pointCoord);

                if (renderNorms) {
                    normBuffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, flatten(normsToDraw), gl.STATIC_DRAW);

                    gl.vertexAttribPointer(normalCoord, 4, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(normalCoord);
                }

                if (renderReflect) {
                    if (subObjArr[i] === "bunny") {
                        if (refractFlag) {
                            gl.uniform1i(refractFlagLoc, 1);
                        }
                    }
                    else {
                        if (reflectFlag) {
                            gl.uniform1i(reflectFlagLoc, 1);
                        }
                    }
                }

                gl.drawArrays(gl.TRIANGLES, 0, pointsToDraw.length);

                if (renderReflect) {
                    gl.uniform1i(refractFlagLoc, 0);
                    gl.uniform1i(reflectFlagLoc, 0);
                }

                if (shadow && lightingFlag && renderShadows && subObjArr[i] !== "bunny") {
                    gl.disableVertexAttribArray(texCoord);

                    gl.uniform4fv(diffuseVLoc, flatten(mult(lightD, vec4(0.0, 0.0, 0.0, 1.0))));
                    gl.uniform4fv(specularVLoc, flatten(mult(lightS, vec4(0.0, 0.0, 0.0, 1.0))));
                    gl.uniform4fv(ambientVLoc, flatten(mult(lightA, vec4(0.0, 0.0, 0.0, 1.0))));
                    gl.uniform1f(shininessLoc, 0);

                    gl.uniformMatrix4fv(viewMLoc, false, flatten(
                        mult(
                            viewM,
                            mult(
                                mult(
                                    translate(lightingCoord[0], lightingCoord[1], lightingCoord[2]),
                                    shadowM
                                ),
                                translate(-lightingCoord[0], -lightingCoord[1], -lightingCoord[2])
                            )
                        )));

                    gl.drawArrays(gl.TRIANGLES, 0, pointsToDraw.length);
                }
            }

            if (object[subObjArr[i]].hasOwnProperty("children")) {
                drawWithMaterial(object[subObjArr[i]].children, renderNorms, renderShadows, renderReflect);
            }
        }
    }
}

// draws the skybox to the scene using object sky and textures 1-6
//
// returns null
function drawSkyBox() {
    gl.uniformMatrix4fv(viewMLoc, false, flatten(viewM));

    let pointCoord = gl.getAttribLocation(glProgram, "pointCoord");
    let texCoord = gl.getAttribLocation(glProgram, "texCoord");

    for (let i = 0; i < sky.vertices.length; i+=6) {
        gl.uniform1i(textureFlagLoc, Math.floor(i / 6) + 1);

        texBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(sky.textCoords.slice(i, i + 6)), gl.STATIC_DRAW);

        gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(texCoord);

        pointBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(sky.vertices.slice(i, i + 6)), gl.STATIC_DRAW);

        gl.vertexAttribPointer(pointCoord, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(pointCoord);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.uniform1i(textureFlagLoc, -1);
}

// ----- MAIN -----
function main() {
    let canvas = document.getElementById("webgl");

    // set canvas size onload
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    const topbarRect = document.getElementById("topbar").getBoundingClientRect();
    const topbarH = topbarRect.height + topbarRect.y + 12;

    canvas.height = windowH - topbarH - topbarRect.y;
    canvas.width = windowW - (topbarRect.x * 2);

    canvasRect = canvas.getBoundingClientRect();

    // webgl setup
    gl = WebGLUtils.setupWebGL(canvas, undefined);
    if (!gl) {
        console.log("Error: could not setup rendering context for WebGL");
        return;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    glProgram = initShaders(gl, "vshader", "fshader");
    gl.useProgram(glProgram);

    // after loading all of the files, render the scene and start the key listener
    loadAllFiles()
        .then(() => {
            document.getElementById("loadText").innerHTML = "Processing GL...";

            initRender();
            // interaction handlers
            document.addEventListener("keydown", (e) => {
                switch (e.key) {
                    // enables/disables lighting
                    case "l":
                        lightingFlag = !lightingFlag;

                        if (lightingFlag) {
                            lightA = vec4(0.01, 0.01, 0.01, 1.0);
                        }
                        else {
                            lightA = vec4(1.0, 1.0, 1.0, 1.0);
                        }
                        break;

                    // enables/disables car animation
                    case "m":
                        animate = !animate;
                        break;

                    // puts the camera on the hood of the car / puts the camera at defaultEye
                    case "c":
                        if (cameraOnCar) {
                            eye = defaultEye;
                            at = defaultAt;
                            cameraOnCar = false;
                        }
                        else {
                            let temp = car["car_Cube.012"].children["camera"];

                            eye = vec3(temp.eye.position[0],
                                temp.eye.position[1],
                                temp.eye.position[2]);
                            at = vec3(temp.at.position[0],
                                temp.at.position[1],
                                temp.at.position[2]);

                            cameraOnCar = true;
                        }

                        break;

                    // enables/disables shadows for drawWithMaterials()
                    case "s":
                        shadow = !shadow;
                        break;

                    // enables/disables skybox
                    case "e":
                        skybox = !skybox;
                        break;

                    // enables/disables reflections for drawWithMaterials()
                    case "r":
                        reflectFlag = !reflectFlag;
                        break;

                    // enables/disables refractions for bunny
                    case "f":
                        refractFlag = !refractFlag;
                        break;
                }
            });
        });
}