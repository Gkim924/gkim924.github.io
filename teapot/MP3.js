
/**
 * @file A simple WebGL example for viewing meshes read from OBJ files
 * @author Eric Shaffer <shaffer1@illinois.edu>  
 */

/** @global The WebGL context */
var gl;

/** @global The HTML5 canvas we draw on */
var canvas;

/** @global A simple GLSL shader program */
var shaderProgram, cubeShaderProgram;

/** @global The Modelview matrix */
var mvMatrix = mat4.create();
var mvMatrixCube = mat4.create();


/** @global The View matrix */
var vMatrix = mat4.create();
var vMatrixCube = mat4.create();

/** @global The Projection matrix */
var pMatrix = mat4.create();
var pMatrixCube = mat4.create();

/** @global The Normal matrix */
var nMatrix = mat3.create();

/** @global The matrix stack for hierarchical modeling */
var mvMatrixStack = [];

/** @global An object holding the geometry for a 3D mesh */
var myMesh;


/**********************************************************************/
var cubeVertices = [];
var cubeColors = [];

var cubeVertexPositionBuffer, cubeVertexColorBuffer;

var viewDirectionProjectionInverseMatrix = mat4.create();

var reflectStatus = false;

var refractStatus = false;

var rotatedNormals = mat4.create();

var refractDir = vec3.fromValues(-0.16,0.32,-0.34);

/**********************************************************************/

// View parameters
/** @global Location of the camera in world coordinates */
var eyePt = vec3.fromValues(0.0,0.0,0.3);
/** @global Direction of the view in world coordinates */
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
/** @global Up vector for view matrix creation, in world coordinates */
var up = vec3.fromValues(0.0,1.0,0.0);
/** @global Location of a point along viewDir in world coordinates */
var viewPt = vec3.fromValues(0.0,0.0,0.0);

//Light parameters
/** @global Light position in VIEW coordinates */
var lightPosition = [1,1,1];
/** @global Ambient light color/intensity for Phong reflection */
var lAmbient = [0,0,0];
/** @global Diffuse light color/intensity for Phong reflection */
var lDiffuse = [1,1,1];
/** @global Specular light color/intensity for Phong reflection */
var lSpecular =[0,0,0];

//Material parameters
/** @global Ambient material color/intensity for Phong reflection */
var kAmbient = [1.0,1.0,1.0];
/** @global Diffuse material color/intensity for Phong reflection */
var kTerrainDiffuse = [205.0/255.0,163.0/255.0,63.0/255.0];
/** @global Specular material color/intensity for Phong reflection */
var kSpecular = [0.0,0.0,0.0];
/** @global Shininess exponent for Phong reflection */
var shininess = 27;
/** @global Edge color fpr wireframeish rendering */
var kEdgeBlack = [0.0,0.0,0.0];
/** @global Edge color for wireframe rendering */
var kEdgeWhite = [1.0,1.0,1.0];


//Model parameters
var eulerY=0;
var eulerPot=0;
var eulerX=0;

//-------------------------------------------------------------------------
/**
 * Asynchronously read a server-side text file
 */
function asyncGetFile(url) {
  //Your code here
  console.log("Getting text file");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET",url);
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(xhr.statusText);
    xhr.send();
    console.log("Made promise");
  });
    
}

//-------------------------------------------------------------------------
/**
 * Sends Modelview matrix to shader
 */
function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
}

//-------------------------------------------------------------------------
/**
 * Sends projection matrix to shader
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, 
                      false, pMatrix);
}

//-------------------------------------------------------------------------
/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

//----------------------------------------------------------------------------------
/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


//----------------------------------------------------------------------------------
/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

//----------------------------------------------------------------------------------
/**
 * Sends projection/modelview matrices to shader
 */
function setMatrixUniforms() {

    gl.useProgram(shaderProgram);
    uploadModelViewMatrixToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
    gl.uniform1i(shaderProgram.skyboxLocation, 0);
    gl.uniformMatrix4fv(shaderProgram.uniformrotNormalsLoc, false, rotatedNormals);
    gl.uniform3fv(shaderProgram.uniformRefractLoc, refractDir);


    if(document.getElementById("phong").checked)
        {
            gl.uniform1f(shaderProgram.uniformReflectToggleLoc, 0.0);
            gl.uniform1f(shaderProgram.uniformRefractToggleLoc, 0.0);
        }  

    if(document.getElementById("reflectButton").checked)
        {
            gl.uniform1f(shaderProgram.uniformReflectToggleLoc, 1.0);
            gl.uniform1f(shaderProgram.uniformRefractToggleLoc, 0.0);
        }    

    if(document.getElementById("refractButton").checked)
        {
            gl.uniform1f(shaderProgram.uniformReflectToggleLoc, 0.0);
            gl.uniform1f(shaderProgram.uniformRefractToggleLoc, 1.0);
        }    

}

function setCubeMatrixUniforms() {

    gl.useProgram(cubeShaderProgram);
    gl.uniformMatrix4fv(cubeShaderProgram.mvMatrixUniformCube, false, mvMatrixCube);
    gl.uniformMatrix4fv(cubeShaderProgram.pMatrixUniformCube, false, pMatrixCube);

    gl.uniformMatrix4fv(
        cubeShaderProgram.viewDirectionProjectionInverseLocation , false,
        viewDirectionProjectionInverseMatrix);

    gl.uniform1i(cubeShaderProgram.skyboxLocation, 0);
}

//----------------------------------------------------------------------------------
/**
 * Translates degrees to radians
 * @param {Number} degrees Degree input to function
 * @return {Number} The radians that correspond to the degree input
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

//----------------------------------------------------------------------------------
/**
 * Creates a context for WebGL
 * @param {element} canvas WebGL canvas
 * @return {Object} WebGL context
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

//----------------------------------------------------------------------------------
/**
 * Loads Shaders
 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);
  
  // If we don't find an element with the specified id
  // we do an early exit 
  if (!shaderScript) {
    return null;
  }
  
  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
 
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
 
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  } 
  return shader;
}

//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders
 */
function setupShaders() {
  vertexShader = loadShaderFromDOM("shader-vs");
  fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");    
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");  
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
  shaderProgram.uniformShininessLoc = gl.getUniformLocation(shaderProgram, "uShininess");    
  shaderProgram.uniformAmbientMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKAmbient");  
  shaderProgram.uniformDiffuseMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKDiffuse");
  shaderProgram.uniformSpecularMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKSpecular");

  shaderProgram.skyboxLocation = gl.getUniformLocation(shaderProgram, "u_skybox");

  shaderProgram.uniformReflectToggleLoc = gl.getUniformLocation(shaderProgram, "reflectToggle");
  shaderProgram.uniformRefractToggleLoc = gl.getUniformLocation(shaderProgram, "refractToggle");
  
  shaderProgram.uniformrotNormalsLoc = gl.getUniformLocation(shaderProgram, "rotNormals");
  shaderProgram.uniformRefractLoc = gl.getUniformLocation(shaderProgram, "refractVect");



}

//-------------------------------------------------------------------------
function setupCubeShaders() {

  cubeVertexShader = loadShaderFromDOM("shader-vs-cube");
  cubeFragmentShader = loadShaderFromDOM("shader-fs-cube");

  cubeShaderProgram = gl.createProgram();
  gl.attachShader(cubeShaderProgram, cubeVertexShader);
  gl.attachShader(cubeShaderProgram, cubeFragmentShader);
  gl.linkProgram(cubeShaderProgram);

  if (!gl.getProgramParameter(cubeShaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup cube shaders");
  }

  gl.useProgram(cubeShaderProgram);
  cubeShaderProgram.vertexPositionAttribute = gl.getAttribLocation(cubeShaderProgram, "aVertexPositionCube");
  gl.enableVertexAttribArray(cubeShaderProgram.vertexPositionAttribute);
  cubeShaderProgram.vertexColorAttribute = gl.getAttribLocation(cubeShaderProgram, "aVertexColorCube"); 
  gl.enableVertexAttribArray(cubeShaderProgram.vertexColorAttribute);
  cubeShaderProgram.mvMatrixUniformCube = gl.getUniformLocation(cubeShaderProgram, "uMVMatrixCube");
  cubeShaderProgram.pMatrixUniformCube = gl.getUniformLocation(cubeShaderProgram, "uPMatrixCube");

  cubeShaderProgram.skyboxLocation = gl.getUniformLocation(cubeShaderProgram, "u_skybox");
  cubeShaderProgram.viewDirectionProjectionInverseLocation = gl.getUniformLocation(cubeShaderProgram, "u_viewDirectionProjectionInverse");

}

//-------------------------------------------------------------------------
function setupCubeTextures() {

  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const faceInfos = [
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      url: './pos-x.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      url: './neg-x.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      url: './pos-y.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      url: './neg-y.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      url: './pos-z.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
      url: './neg-z.png',
    },
  ];

  faceInfos.forEach((faceInfo) => {
    const {target, url} = faceInfo;

    // Upload the canvas to the cubemap face.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 512;
    const height = 512;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;

    // setup each face so it's immediately renderable
    gl.texImage2D(target, level, internalFormat, width, height, 0, format, type, null);

    // Asynchronously load an image
    const image = new Image();
    image.src = url;
    

    image.addEventListener('load', function() {
      //image.attachEvent("onload", function() {
      // Now that the image has loaded make copy it to the texture.
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
      gl.texImage2D(target, level, internalFormat, format, type, image);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

      });
    
  });

  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

}




//-------------------------------------------------------------------------
function loadCubeVertices() {

  cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);

  cubeVertices = 

  [
    -0.5, -0.5,  -0.5,
    -0.5,  0.5,  -0.5,
     0.5, -0.5,  -0.5,
    -0.5,  0.5,  -0.5,
     0.5,  0.5,  -0.5,
     0.5, -0.5,  -0.5,

    -0.5, -0.5,   0.5,
     0.5, -0.5,   0.5,
    -0.5,  0.5,   0.5,
    -0.5,  0.5,   0.5,
     0.5, -0.5,   0.5,
     0.5,  0.5,   0.5,

    -0.5,   0.5, -0.5,
    -0.5,   0.5,  0.5,
     0.5,   0.5, -0.5,
    -0.5,   0.5,  0.5,
     0.5,   0.5,  0.5,
     0.5,   0.5, -0.5,

    -0.5,  -0.5, -0.5,
     0.5,  -0.5, -0.5,
    -0.5,  -0.5,  0.5,
    -0.5,  -0.5,  0.5,
     0.5,  -0.5, -0.5,
     0.5,  -0.5,  0.5,

    -0.5,  -0.5, -0.5,
    -0.5,  -0.5,  0.5,
    -0.5,   0.5, -0.5,
    -0.5,  -0.5,  0.5,
    -0.5,   0.5,  0.5,
    -0.5,   0.5, -0.5,

     0.5,  -0.5, -0.5,
     0.5,   0.5, -0.5,
     0.5,  -0.5,  0.5,
     0.5,  -0.5,  0.5,
     0.5,   0.5, -0.5,
     0.5,   0.5,  0.5

     ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVertices), gl.STATIC_DRAW);
  cubeVertexPositionBuffer.itemSize = 3;
  cubeVertexPositionBuffer.numberOfItems = cubeVertices.length / cubeVertexPositionBuffer.itemSize;

}

function loadCubeColors() {

  cubeVertexColorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
  
  cubeColors = [

        0.6, 0, 0.0, 1.0,
        0.6, 0, 0.0, 1.0,
        0.6, 0, 0.0, 1.0,
        0.6, 0, 0.0, 1.0,
        0.6, 0, 0.0, 1.0,
        0.6, 0, 0.0, 1.0,

        0, 0.6, 0.0, 1.0,
        0, 0.6, 0.0, 1.0,
        0, 0.6, 0.0, 1.0,
        0, 0.6, 0.0, 1.0,
        0, 0.6, 0.0, 1.0,
        0, 0.6, 0.0, 1.0,

        0, 0, 0.6, 1.0,
        0, 0, 0.6, 1.0,
        0, 0, 0.6, 1.0,
        0, 0, 0.6, 1.0,
        0, 0, 0.6, 1.0,
        0, 0, 0.6, 1.0,

        0.6, 0.6, 0.6, 1.0,
        0.6, 0.6, 0.6, 1.0,
        0.6, 0.6, 0.6, 1.0,
        0.6, 0.6, 0.6, 1.0,
        0.6, 0.6, 0.6, 1.0,
        0.6, 0.6, 0.6, 1.0,

        0.6, 0.6, 0, 1.0,
        0.6, 0.6, 0, 1.0,
        0.6, 0.6, 0, 1.0,
        0.6, 0.6, 0, 1.0,
        0.6, 0.6, 0, 1.0,
        0.6, 0.6, 0, 1.0,

        0.0, 0.6, 0.6, 1.0,
        0.0, 0.6, 0.6, 1.0,
        0.0, 0.6, 0.6, 1.0,
        0.0, 0.6, 0.6, 1.0,
        0.0, 0.6, 0.6, 1.0,
        0.0, 0.6, 0.6, 1.0

  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeColors), gl.STATIC_DRAW);
  cubeVertexColorBuffer.itemSize = 4;
  cubeVertexColorBuffer.numItems = cubeVertexColorBuffer.length / 4; 

}

//-------------------------------------------------------------------------
function setupCubeBuffers() {

    loadCubeVertices();

    loadCubeColors();

}

//-------------------------------------------------------------------------
/**
 * Sends material information to the shader
 * @param {Float32} alpha shininess coefficient
 * @param {Float32Array} a Ambient material color
 * @param {Float32Array} d Diffuse material color
 * @param {Float32Array} s Specular material color
 */
function setMaterialUniforms(alpha,a,d,s) {
  gl.uniform1f(shaderProgram.uniformShininessLoc, alpha);
  gl.uniform3fv(shaderProgram.uniformAmbientMaterialColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseMaterialColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularMaterialColorLoc, s);
}

//-------------------------------------------------------------------------
/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} a Ambient light strength
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function setLightUniforms(loc,a,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

//----------------------------------------------------------------------------------
/**
 * Populate buffers with data
 */
function setupMesh(filename) {
   //Your code here
   myMesh = new TriMesh();
   myPromise = asyncGetFile(filename);
   myPromise.then((retrievedText) => {
    myMesh.loadFromOBJ(retrievedText);
    //console.log("vBuffer len:"+myMesh.vBuffer.length);
   console.log("Yay! got the file");
 })
 .catch(
    (reason) => {
        console.log('Handle rejected promise ('+reason+') here');
    });





}



//----------------------------------------------------------------------------------
function drawCube() {

  

  //rotations for testing
  mat4.rotateY(mvMatrixCube, mvMatrixCube, degToRad(eulerY));
  //mat4.rotateX(mvMatrixCube, mvMatrixCube, degToRad(eulerX));
  

  eulerY = 0;
  eulerX = 0;

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  gl.vertexAttribPointer(cubeShaderProgram.vertexPositionAttribute, 
                         cubeVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
  gl.vertexAttribPointer(cubeShaderProgram.vertexColorAttribute, 
                            cubeVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0);
  
  setCubeMatrixUniforms();                        
  gl.drawArrays(gl.TRIANGLES, 0, cubeVertexPositionBuffer.numberOfItems);



}

//----------------------------------------------------------------------------------
/**
 * Draw call that applies matrix transformations to model and draws model in frame
 */
function draw() { 
    //console.log("function draw()");
    //console.log("eyex:"+eyePt[0]+" eyez:"+eyePt[2]+" angle:"+rotAngleDeg);
  
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective 
    mat4.perspective(pMatrix,degToRad(45), 
                     gl.viewportWidth / gl.viewportHeight,
                     0.1, 500.0);

    //////
    mat4.perspective(pMatrixCube,degToRad(75), 
                     gl.viewportWidth / gl.viewportHeight,
                     0.1, 500.0);

    // We want to look down -z, so create a lookat point in that direction    
    vec3.add(viewPt, eyePt, viewDir);

    // Then generate the lookat matrix and initialize the view matrix to that view
    mat4.lookAt(vMatrix,eyePt,viewPt,up);

    //////
    mat4.lookAt(vMatrixCube,eyePt,viewPt,up);

    //mat4.invert(viewDirectionProjectionInverseMatrix, pMatrix);

    //Draw Cube
    drawCube()
    
    
    //Draw Mesh
    //ADD an if statement to prevent early drawing of myMesh
    if(myMesh.loaded()){
      mvPushMatrix();
        mat4.rotateY(mvMatrix, mvMatrix, degToRad(eulerPot));
        mat4.multiply(mvMatrix,vMatrix,mvMatrix);
        setMatrixUniforms();
        setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);
    
        if ((document.getElementById("polygon").checked) || (document.getElementById("wirepoly").checked))
        {
            setMaterialUniforms(shininess,kAmbient,
                                kTerrainDiffuse,kSpecular); 
            myMesh.drawTriangles();
        }
    
        if(document.getElementById("wirepoly").checked)
        {   
            setMaterialUniforms(shininess,kAmbient,
                                kEdgeBlack,kSpecular);
            myMesh.drawEdges();
        }   

        if(document.getElementById("wireframe").checked)
        {
            setMaterialUniforms(shininess,kAmbient,
                                kEdgeWhite,kSpecular);
            myMesh.drawEdges();
        }   
        mvPopMatrix();
    }
        
    
  
}

//----------------------------------------------------------------------------------
//Code to handle user interaction
var currentlyPressedKeys = {};

function handleKeyDown(event) {
        //console.log("Key down ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = true;
          if (currentlyPressedKeys["a"]) {
            // key A
            eulerY+= 1;
            eulerPot+=1;     

            mat4.rotateY(rotatedNormals,rotatedNormals,degToRad(-eulerY)); 

        } else if (currentlyPressedKeys["d"]) {
            // key D
            eulerY-= 1;
            eulerPot-=1;

            mat4.rotateY(rotatedNormals,rotatedNormals,degToRad(-eulerY));
        } 

        if (currentlyPressedKeys["w"]) {
            // key W
            eulerX-= 1;
        } else if (currentlyPressedKeys["s"]) {
            // key S
            eulerX+= 1;
        } 
    
        if (currentlyPressedKeys["ArrowUp"]){
            // Up cursor key
            event.preventDefault();
            //eyePt[2]+= 0.01;
        } else if (currentlyPressedKeys["ArrowDown"]){
            event.preventDefault();
            // Down cursor key
            //eyePt[2]-= 0.01;
        } 

        if (currentlyPressedKeys["ArrowLeft"]){
            // Left cursor key
            event.preventDefault();
            eulerPot-=1;
        } else if (currentlyPressedKeys["ArrowRight"]){
            event.preventDefault();
            // Right cursor key
            eulerPot+=1;
        } 
    
}

function handleKeyUp(event) {
        //console.log("Key up ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = false;
}

//----------------------------------------------------------------------------------
/**
 * Startup function called from html code to start program.
 */
 function startup() {
  canvas = document.getElementById("myGLCanvas");
  gl = createGLContext(canvas);

  //set up cube shader/s
  setupCubeShaders();
  //set up cube buffer
  setupCubeBuffers();
  //draw cube 
  setupCubeTextures();


  //code for the teapot
  setupShaders();
  setupMesh("teapot.obj");
  //scale teapot
  mat4.scale(mvMatrix,mvMatrix,[0.015,0.015,0.015]);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  var orbitTeapotCW = document.querySelector('.orbit-teapot-cw')
  orbitTeapotCW.addEventListener('click', () => {
    //console.log('orbit-teapot-cw')
    eulerY-= 1;
    eulerPot-=1;
    mat4.rotateY(rotatedNormals,rotatedNormals,degToRad(-eulerY));
  })

  var orbitTeapotCCW = document.querySelector('.orbit-teapot-ccw')
  orbitTeapotCCW.addEventListener('click', () => {
    // console.log('orbit-teapot-ccw')
    eulerY+= 1;
    eulerPot+=1;     
    mat4.rotateY(rotatedNormals,rotatedNormals,degToRad(-eulerY));
  })

  var rotateTeapotCW = document.querySelector('.rotate-teapot-cw')
  rotateTeapotCW.addEventListener('click', () => {
    // console.log('rotate-teapot-cw')
    eulerPot-=5;
  })

  var rotateTeapotCCW = document.querySelector('.rotate-teapot-ccw')
  rotateTeapotCCW.addEventListener('click', () => {
    // console.log('rotate-teapot-ccw')
    eulerPot+=5;
  })


  //document.onkeydown = handleKeyDown;
  //document.onkeyup = handleKeyUp;
  tick();

}


//----------------------------------------------------------------------------------
/**
  * Update any model transformations
  */
function animate() {
   //console.log(eulerX, " ", eulerY, " ", eulerZ); 
   //document.getElementById("eY").value=eulerY;
   //document.getElementById("eZ").value=eyePt[2];    
}


//----------------------------------------------------------------------------------
/**
 * Keeping drawing frames....
 */
function tick() {
    requestAnimFrame(tick);
    animate();
    draw();
}

//----------------------------------------------------------------------------------
/**
 * Toggle the reflection
 */
function renderReflection() {
  reflectStatus = ~reflectStatus;
  if(reflectStatus){
    console.log("Rendering Reflection");
    gl.uniform1f(shaderProgram.uniformReflectToggleLoc, 1.0);
    draw();
  }
  else {
    console.log("Reflection Rendering Disabled");
    gl.uniform1f(shaderProgram.uniformReflectToggleLoc, 0.0);
    draw();
  }
  
}

//----------------------------------------------------------------------------------
/**
 * Toggle the refraction
 */
function renderRefraction() {
  refractStatus = ~refractStatus;
  if(reflectStatus){
    console.log("Rendering Refraction");
    gl.uniform1f(shaderProgram.uniformRefractToggleLoc, 1.0);
    draw();
  }
  else {
    console.log("Refraction Rendering Disabled");
    gl.uniform1f(shaderProgram.uniformRefractToggleLoc, 0.0);
    draw();
  }
  
}